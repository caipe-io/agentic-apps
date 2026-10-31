import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createAgenticSdlcReferenceServer } from "../server.mjs";

const secret = "example-native-contract-test-secret-12345";

function token(scopes) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: "caipe-agentic-apps",
    aud: "agentic-app:agentic-sdlc",
    app_id: "agentic-sdlc",
    sub: "test-user",
    scp: scopes,
    exp: Math.floor(Date.now() / 1000) + 300,
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

test("native context requires a verified app-scoped read token", async () => {
  const previousSecret = process.env.AGENTIC_APP_TOKEN_SECRET;
  const previousDisable = process.env.AGENTIC_APP_AGENTIC_SDLC_JWT_DISABLED;
  process.env.AGENTIC_APP_TOKEN_SECRET = secret;
  delete process.env.AGENTIC_APP_AGENTIC_SDLC_JWT_DISABLED;
  const server = createAgenticSdlcReferenceServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const missing = await fetch(`${base}/api/agentic-sdlc/context`);
    assert.equal(missing.status, 401);

    const wrongScope = await fetch(`${base}/api/agentic-sdlc/context`, {
      headers: { authorization: `Bearer ${token(["agents:invoke"])}` },
    });
    assert.equal(wrongScope.status, 403);

    const authorized = await fetch(`${base}/api/agentic-sdlc/context`, {
      headers: { authorization: `Bearer ${token(["sdlc:read"])}` },
    });
    assert.equal(authorized.status, 200);
    const payload = await authorized.json();
    assert.equal(payload.route, "/sdlc");
    assert.equal(payload.authorization.launchDecision, "ALLOW");
    assert.equal(payload.authorization.readScopeGranted, true);
    assert.equal(JSON.stringify(payload).includes(secret), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousSecret === undefined) delete process.env.AGENTIC_APP_TOKEN_SECRET;
    else process.env.AGENTIC_APP_TOKEN_SECRET = previousSecret;
    if (previousDisable === undefined) delete process.env.AGENTIC_APP_AGENTIC_SDLC_JWT_DISABLED;
    else process.env.AGENTIC_APP_AGENTIC_SDLC_JWT_DISABLED = previousDisable;
  }
});
