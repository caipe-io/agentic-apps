import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

async function launch(t) {
  const child = spawn(process.execPath, ["ui/apps/agentic-apps/secops/server.mjs"], { env: { ...process.env, NODE_ENV: "test", SECOPS_APP_PORT: "0", AGENTIC_APP_SECOPS_JWT_DISABLED: "true", SECOPS_AWS_ACCOUNT_LIST: "primary:123456789012", SECOPS_AWS_REGIONS: "us-east-1", SECOPS_GITHUB_REPOS: "example/repo", SECOPS_GITHUB_TOKEN: "" }, stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => child.kill("SIGTERM"));
  let output = ""; child.stderr.on("data", (part) => { output += part; });
  const port = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Startup timed out: " + output)), 10000); child.once("exit", () => { clearTimeout(timer); reject(new Error("Runtime exited: " + output)); }); child.stdout.on("data", (part) => { output += part; const match = output.match(/localhost:(\d+)/); if (match) { clearTimeout(timer); resolve(Number(match[1])); } }); });
  return `http://127.0.0.1:${port}`;
}

test("runtime enforces configured scopes and exposes unavailable GitHub data without credentials", async (t) => {
  const base = await launch(t);
  assert.equal((await fetch(base + "/health/ready")).status, 200);
  const page = await (await fetch(base + "/")).text();
  assert.match(page, /SecOps review/); assert.match(page, /caipe\.agenticApp\.assistant\.open\.v1/);
  assert.equal((await fetch(base + "/api/aws?profile=other&region=us-east-1")).status, 400);
  assert.equal((await fetch(base + "/api/aws?profile=primary&region=us-west-2")).status, 400);
  assert.equal((await fetch(base + "/api/github?repo=other/repo")).status, 400);
  const source = await (await fetch(base + "/api/github?repo=example/repo")).json();
  assert.equal(source.data.status, "unavailable");
  assert.equal((await fetch(base + "/api/aws", { method: "POST" })).status, 405);
});
