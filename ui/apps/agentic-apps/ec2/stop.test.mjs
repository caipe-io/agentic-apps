import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { canRequestEc2Stop, createEc2StopRequests, ec2StopConfiguration, buildEc2StopPlan, validateEc2StopResponse } from "./stop.mjs";
import { createAwsInventoryService } from "./sdk-inventory.mjs";

const configuration = { accounts: [{ profile: "primary", accountId: "111111111111" }], regions: ["us-east-1"], agentId: "example-agent", cacheTtlMs: 28_800_000 };
const settings = { enabled: true, profiles: ["primary"], subjects: ["test-user", "other-user"], agentId: "example-agent" };
const identity = { subject: "test-user", scopes: ["ec2:stop"] };
const target = { profile: "primary", accountId: "111111111111", region: "us-east-1", instanceId: "i-0123456789abcdef0" };
function fixture() {
  let time = 0; let state = "running"; let reads = 0; let invalidations = 0;
  const inventory = { read: async (scope, options) => {
    assert.equal(options.refresh, true); reads++;
    return { accountId: scope.accountId, instances: [{ ...scope, name: "example-worker", instanceType: "t3.small", tags: [], state }] };
  }, invalidateScope: () => invalidations++ };
  const stops = createEc2StopRequests({ configuration, settings, inventory, now: () => time });
  return { stops, setTime: (value) => time = value, setState: (value) => state = value, reads: () => reads, invalidations: () => invalidations };
}
test("stop requires opt-in profiles and verified subject allowlist", () => {
  assert.equal(ec2StopConfiguration({}, configuration).enabled, false);
  assert.throws(() => ec2StopConfiguration({ EC2_STOP_ENABLED: "true" }, configuration));
  assert.throws(() => ec2StopConfiguration({ EC2_STOP_ENABLED: "true", EC2_STOP_PROFILES: "unknown", EC2_STOP_ALLOWED_SUBJECTS: "test-user" }, configuration));
  assert.equal(canRequestEc2Stop({ subject: "forged-user" }, settings), false);
});
test("readers and unlisted callers cannot prepare a stop or perform AWS reads", async () => {
  const f = fixture();
  await assert.rejects(f.stops.prepare(target, { ...identity, scopes: ["ec2:read"] }));
  await assert.rejects(f.stops.prepare(target, { ...identity, subject: "forged-user" }));
  assert.equal(f.reads(), 0);
});
test("target allowlist and exact single instance shape are enforced", async () => {
  const f = fixture();
  for (const change of [{ profile: "secondary" }, { region: "us-west-2" }, { instanceId: target.instanceId + " --force" }, { instanceId: "i-123456789" }]) await assert.rejects(f.stops.prepare({ ...target, ...change }, identity));
  assert.equal(f.reads(), 0);
});
test("confirmation is caller-bound, exact, fresh, and one use", async () => {
  const f = fixture(); const approval = await f.stops.prepare(target, identity);
  assert.equal(approval.prompt, undefined);
  await assert.rejects(f.stops.confirm({ requestId: approval.requestId, confirmation: target.instanceId }, { ...identity, subject: "other-user" }));
  await assert.rejects(f.stops.confirm({ requestId: approval.requestId, confirmation: "example-worker" }, identity));
  const plan = await f.stops.confirm({ requestId: approval.requestId, confirmation: target.instanceId, profile: "secondary" }, identity);
  assert.equal(plan.scope.profile, "primary");
  assert.equal(plan.command, "ec2 stop-instances --instance-ids " + target.instanceId);
  assert.equal(f.reads(), 2);
  await assert.rejects(f.stops.confirm({ requestId: approval.requestId, confirmation: target.instanceId }, identity));
});
test("expired approvals and changed instance state never return an execution plan", async () => {
  const f = fixture(); let approval = await f.stops.prepare(target, identity);
  f.setTime(120_001);
  await assert.rejects(f.stops.confirm({ requestId: approval.requestId, confirmation: target.instanceId }, identity));
  approval = await f.stops.prepare(target, identity); f.setState("stopping");
  await assert.rejects(f.stops.confirm({ requestId: approval.requestId, confirmation: target.instanceId }, identity));
});
test("concurrent confirmation consumes the approval once", async () => {
  const f = fixture(); const a = await f.stops.prepare(target, identity);
  const input = { requestId: a.requestId, confirmation: target.instanceId };
  const results = await Promise.allSettled([f.stops.confirm(input, identity), f.stops.confirm(input, identity)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
});
test("status revalidates permission and invalidates only its configured scope", async () => {
  const f = fixture();
  await assert.rejects(f.stops.status(target, { ...identity, subject: "forged-user" }));
  assert.equal(f.invalidations(), 0);
  f.setState("stopped"); const result = await f.stops.status(target, identity);
  assert.equal(result.instances[0].state, "stopped"); assert.equal(f.invalidations(), 1);
});
test("accepted responses require exact identity, normal command and one stop evidence", () => {
  const plan = buildEc2StopPlan(target, "example-request", "example-agent");
  const value = { ...target, requestId: plan.requestId, status: "accepted", message: "Stop accepted", currentState: "stopping", evidence: ["sts get-caller-identity", plan.describeCommand, plan.command].map((command) => ({ command, tool: "aws_cli_execute", profile: target.profile, region: target.region })) };
  assert.equal(validateEc2StopResponse(value, plan).currentState, "stopping");
  assert.throws(() => validateEc2StopResponse({ ...value, accountId: "222222222222" }, plan));
  assert.throws(() => validateEc2StopResponse({ ...value, currentState: "terminated" }, plan));
  assert.throws(() => validateEc2StopResponse({ ...value, evidence: value.evidence.slice(0, 2) }, plan));
  assert.throws(() => validateEc2StopResponse({ ...value, evidence: [...value.evidence, value.evidence[2]] }, plan));
  assert.throws(() => validateEc2StopResponse({ ...value, evidence: value.evidence.map((e) => ({ ...e, command: e.command.replace("stop-instances", "terminate-instances") })) }, plan));
});
for (const background of [false, true]) test("an invalidated " + (background ? "background refresh" : "in-flight fleet read") + " cannot restore stale running state", { timeout: 5000 }, async () => {
  let releaseOld; const oldGate = new Promise((resolve) => releaseOld = resolve);
  let startedOld; const started = new Promise((resolve) => startedOld = resolve);
  let calls = 0;
  const clients = {
    sts: { send: async () => ({ Account: target.accountId }) },
    ec2: { send: async (command) => {
      if (command.constructor.name !== "DescribeInstancesCommand") return { InstanceTypes: [] };
      const call = ++calls;
      if (call === 2) { startedOld(); await oldGate; }
      return { Reservations: [{ OwnerId: target.accountId, Instances: [{ InstanceId: target.instanceId, InstanceType: "t3.small", State: { Name: call >= 3 ? "stopped" : "running" }, Tags: [] }] }] };
    } },
    ssm: { send: async () => ({ InstanceInformationList: [] }) },
    pricing: { send: async () => ({ PriceList: [] }) },
  };
  const service = createAwsInventoryService(configuration, { clientsForScope: () => clients });
  await service.read(target);
  const oldRead = background ? service.refreshAll() : service.read(target, { refresh: true }); await started;
  service.invalidateScope(target);
  assert.equal((await service.read(target)).instances[0].state, "stopped");
  releaseOld(); await oldRead;
  assert.equal((await service.read(target)).instances[0].state, "stopped");
});

test("HTTP stop endpoint enforces signed mutation scope and subject before AWS access", { timeout: 10_000 }, async (t) => {
  const secret = "example-stop-runtime-test-secret-12345";
  const child = spawn(process.execPath, ["server.mjs"], { cwd: new URL(".", import.meta.url), env: { ...process.env, NODE_ENV: "test", EC2_APP_PORT: "0", EC2_BACKGROUND_REFRESH_ENABLED: "false", EC2_AWS_ACCOUNT_LIST: "primary:111111111111", EC2_AWS_REGIONS: "us-east-1", EC2_STOP_ENABLED: "true", EC2_STOP_PROFILES: "primary", EC2_STOP_ALLOWED_SUBJECTS: "test-user", AGENTIC_APP_TOKEN_SECRET: secret }, stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => child.kill());
  const port = await new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => { const match = chunk.toString().match(/localhost:(\d+)/); if (match) resolve(match[1]); });
    child.once("error", reject); child.once("exit", () => reject(new Error("Runtime exited before readiness.")));
  });
  const token = (sub, scp) => {
    const enc = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const input = enc({ alg: "HS256" }) + "." + enc({ iss: "caipe-agentic-apps", aud: "agentic-app:ec2", app_id: "ec2", sub, scp, exp: Math.floor(Date.now() / 1000) + 60 });
    return input + "." + createHmac("sha256", secret).update(input).digest("base64url");
  };
  const url = "http://127.0.0.1:" + port;
  const body = JSON.stringify({ kind: "prepare", ...target });
  assert.equal((await fetch(url + "/api/stop-request", { method: "POST", body })).status, 401);
  assert.equal((await fetch(url + "/api/stop-request", { method: "POST", body, headers: { authorization: "Bearer " + token("test-user", ["ec2:read"]) } })).status, 403);
  assert.equal((await fetch(url + "/api/stop-request", { method: "POST", body, headers: { authorization: "Bearer " + token("unlisted-user", ["ec2:stop"]) } })).status, 403);
  const allowed = await fetch(url + "/api/stop-capability", { headers: { authorization: "Bearer " + token("test-user", ["ec2:read"]) } });
  assert.equal((await allowed.json()).data.allowed, true);
  const denied = await fetch(url + "/api/stop-capability", { headers: { authorization: "Bearer " + token("unlisted-user", ["ec2:read"]) } });
  assert.deepEqual((await denied.json()).data, { allowed: false, profiles: [] });
  assert.equal((await fetch(url + "/api/stop-request", { method: "POST", body: "x".repeat(5000), headers: { authorization: "Bearer " + token("test-user", ["ec2:stop"]) } })).status, 400);
});
