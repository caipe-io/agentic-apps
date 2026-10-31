import test from "node:test";
import assert from "node:assert/strict";
import { exposureSignals, iamUserRows, githubControlSummary } from "./findings.mjs";
import { secopsConfiguration } from "./config.mjs";
import { createGithubScanner } from "./github.mjs";

test("flags public SSH and development ingress per network interface without asserting reachability", () => {
  const groups = [{ GroupId: "sg-1", IpPermissions: [{ IpProtocol: "tcp", FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: "0.0.0.0/0" }] }, { IpProtocol: "tcp", FromPort: 8080, ToPort: 8080, Ipv6Ranges: [{ CidrIpv6: "::/0" }] }] }];
  const instances = [{ InstanceId: "i-example", State: { Name: "running" }, Tags: [{ Key: "Environment", Value: "dev" }], NetworkInterfaces: [{ NetworkInterfaceId: "eni-example", Association: { PublicIp: "203.0.113.4" }, Ipv6Addresses: [{ Ipv6Address: "2001:db8::1" }], Groups: [{ GroupId: "sg-1" }] }] }];
  const rows = exposureSignals(instances, groups);
  assert.deepEqual(rows.map((row) => row.kind), ["public_ssh_candidate", "public_dev_ingress_candidate"]);
  assert.deepEqual(rows[0].sources, ["0.0.0.0/0"]); assert.deepEqual(rows[1].sources, ["::/0"]);
  assert.throws(() => exposureSignals(instances, []), /unavailable/);
  assert.equal(exposureSignals([{ ...instances[0], NetworkInterfaces: [{ Groups: [{ GroupId: "sg-1" }] }] }], groups).length, 0);
});

test("IAM rows preserve every user and distinguish three ages and unknown evidence", () => {
  const now = Date.parse("2026-10-31T00:00:00Z"); const ago = (days) => new Date(now - days * 86400000);
  const users = [{ UserName: "older", CreateDate: ago(181), PasswordLastUsed: ago(220) }, { UserName: "newer", CreateDate: ago(179) }, { UserName: "missing", CreateDate: ago(200), PasswordLastUsed: ago(200) }];
  const details = new Map([["older", { complete: true, keys: [{ createdAt: ago(300), lastUsed: ago(210) }] }], ["newer", { complete: true, keys: [] }], ["missing", { complete: false, keys: [] }]]);
  const [old, newer, missing] = iamUserRows(users, details, now);
  assert.equal(old.olderThan180Days, true); assert.equal(old.lastObservedUseOlder180Days, true); assert.equal(old.accessKeyOlder180Days, true);
  assert.equal(newer.olderThan180Days, false); assert.equal(newer.lastObservedUseOlder180Days, null); assert.equal(newer.accessKeyOlder180Days, false);
  assert.equal(missing.lastObservedUseOlder180Days, null); assert.equal(missing.accessKeyOlder180Days, null);
  const unknown = iamUserRows([users[0]], new Map([["older", { complete: true, keys: [{ createdAt: ago(300), lastUsed: null }] }]]), now)[0];
  assert.equal(unknown.lastObservedUseOlder180Days, null);
  assert.equal(iamUserRows([{ UserName: "boundary", CreateDate: ago(180) }], new Map(), now)[0].olderThan180Days, false);
});

test("configured scope rejects invalid IDs and branch rules preserve unknowns", () => {
  assert.throws(() => secopsConfiguration({ SECOPS_AWS_ACCOUNT_LIST: "example:123" }), /twelve-digit/);
  assert.throws(() => secopsConfiguration({ SECOPS_GITHUB_REPOS: "../x" }), /valid/);
  const repo = { full_name: "example/repo", default_branch: "main", private: true };
  assert.equal(githubControlSummary(repo, { protected: false }, [], { state: "absent" }).checks.pullRequests, "not_detected");
  assert.equal(githubControlSummary(repo, { protected: false }, [], { state: "unavailable" }).checks.requiredChecks, "unknown");
  assert.equal(githubControlSummary(repo, { protected: false }, [{ type: "pull_request" }], { state: "unavailable" }).checks.pullRequests, "present");
});

test("GitHub scanner enforces repository allowlist and does not treat missing permissions as missing controls", async () => {
  const calls = []; const request = async (url) => { calls.push(url); const path = new URL(url).pathname; if (path.endsWith("/repo")) return { ok: true, json: async () => ({ full_name: "example/repo", default_branch: "main", private: true }) }; if (path.endsWith("/branches/main")) return { ok: true, json: async () => ({ protected: true }) }; return { ok: false, status: 403 }; };
  const scan = createGithubScanner({ repos: ["example/repo"], token: "test-only", request });
  await assert.rejects(() => scan("other/repo"), /configured/);
  const result = await scan("example/repo");
  assert.equal(result.status, "partial"); assert.equal(result.data.checks.branchProtection, "present"); assert.equal(result.data.checks.pullRequests, "unknown"); assert.ok(calls.every((url) => url.startsWith("https://api.github.com/repos/example/repo")));
});
