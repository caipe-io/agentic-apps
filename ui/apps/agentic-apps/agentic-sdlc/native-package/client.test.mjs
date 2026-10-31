import assert from "node:assert/strict";
import test from "node:test";

import { invokeDeliveryDashboard, loadNativeContext } from "./client.mjs";

test("loads context through the authenticated native API mount", async () => {
  const calls = [];
  const context = await loadNativeContext({
    fetchImpl: async (path, options) => {
      calls.push({ path, options });
      return new Response(JSON.stringify({
        appId: "agentic-sdlc",
        agentId: "agent-agentic-sdlc",
      }), { status: 200 });
    },
  });
  assert.equal(context.appId, "agentic-sdlc");
  assert.equal(calls[0].path, "/api/agentic-sdlc/context");
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.equal(calls[0].options.headers.authorization, undefined);
});

test("invokes the bound agent using the host session and opens a conversation", async () => {
  const calls = [];
  const result = await invokeDeliveryDashboard("example-team/example-repo", async (path, options) => {
    calls.push({ path, options });
    return new Response(JSON.stringify(path === "/api/chat/conversations"
      ? { data: { conversation: { _id: "conversation-123" } } }
      : { content: "No repository data is available." }), { status: 200 });
  });
  assert.deepEqual(result, {
    conversationId: "conversation-123",
    content: "No repository data is available.",
  });
  assert.deepEqual(calls.map((call) => call.path), [
    "/api/chat/conversations",
    "/api/v1/chat/invoke",
  ]);
  assert.ok(calls.every((call) => call.options.credentials === "same-origin"));
  assert.ok(calls.every((call) => !call.options.headers.authorization));
  assert.equal(JSON.parse(calls[1].options.body).agent_id, "agent-agentic-sdlc");
});

test("does not invoke without a repository", async () => {
  await assert.rejects(invokeDeliveryDashboard("", () => { throw new Error("unexpected request"); }),
    /Repository is required/);
});
