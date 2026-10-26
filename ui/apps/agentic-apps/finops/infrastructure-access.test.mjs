import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import test from "node:test";

test("infrastructure discovery retains FinOps read authorization and configured-account boundaries", async () => {
  const secret = "example-finops-test-secret";
  const child = spawn(process.execPath, [new URL("./server.mjs", import.meta.url).pathname], { env: { ...process.env, NODE_ENV: "test", FINOPS_APP_PORT: "0", FINOPS_AWS_ACCOUNT_LIST: "primary:111111111111", FINOPS_BACKGROUND_REFRESH_ENABLED: "false", FINOPS_SOURCE_REGIONS: "us-east-1", INFRA_SOURCE_CONFIG: "{}", INFRA_SOURCE_CONFIG_FILE: "", AGENTIC_APP_TOKEN_SECRET: secret, AGENTIC_APP_FINOPS_JWT_DISABLED: "false" }, stdio: ["ignore", "pipe", "pipe"] });
  try {
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Test server did not start")), 10000);
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk; const match = output.match(/listening on http:\/\/localhost:(\d+)/); if (match) { clearTimeout(timeout); resolve(Number(match[1])); } });
      child.on("error", (error) => { clearTimeout(timeout); reject(error); });
      child.on("exit", () => { clearTimeout(timeout); reject(new Error("Test server exited before readiness")); });
    });
    const endpoint = "http://127.0.0.1:" + port + "/api/infrastructure-sources";
    const jwt = (scopes) => {
      const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
      const now = Math.floor(Date.now() / 1000);
      const data = encode({ alg: "HS256", typ: "JWT" }) + "." + encode({ iss: "caipe-agentic-apps", aud: "agentic-app:finops", app_id: "finops", sub: "test-user", scp: scopes, iat: now, exp: now + 60 });
      return data + "." + createHmac("sha256", secret).update(data).digest("base64url");
    };
    assert.equal((await fetch(endpoint)).status, 401);
    assert.equal((await fetch(endpoint, { headers: { authorization: "Bearer " + jwt(["finops:agent:invoke"]) } })).status, 403);
    const headers = { authorization: "Bearer " + jwt(["finops:read"]) };
    const allowed = await fetch(endpoint, { headers }); assert.equal(allowed.status, 200); assert.equal((await allowed.json()).data.status, "disabled");
    assert.equal((await fetch(endpoint + "?profile=unconfigured", { headers })).status, 400);
    assert.equal((await fetch(endpoint, { headers, method: "POST" })).status, 403);
  } finally { if (child.pid && child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill(); await exited; } }
});
