import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { setFixture, SetupError } from "./fixtures/manual-review.mjs";
const subject = new URL("./src/lib/agentic-sdlc/manual-review.ts", import.meta.url).href;
const fixture = new URL("./fixtures/manual-review.mjs", import.meta.url).href;
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL === subject && ["./review-setup", "./review-bindings", "./platform-client"].includes(specifier))
    return { url: fixture, shortCircuit: true };
  return next(specifier, context);
} });
const { requestManualReview } = await import(subject);
hooks.deregister();
const head = "a".repeat(40);
const body = { head_sha: head, request_id: "b6a6d8ec-8f03-46b7-a21f-09af26d6ee00" };
function setup(changes = {}) {
  const binding = { repo_id: "1", full_name: "example/repository", state: "enabled", task_id: "review-task", agent_id: "review-agent", owner_sub: "owner-sub", binding_key: "binding-key", ...changes.binding };
  const task = { enabled: true, dynamic_agent_id: "review-agent", owner_sub: "owner-sub", description: "[sdlc-binding:binding-key]", manual_run_context_version: 1, prompt: "<!-- caipe-pr-manual-review-policy:v1 -->", ...changes.task };
  const calls = [];
  setFixture({
    repositoryContext: async () => {
      if (changes.denyRepo) throw new SetupError("Forbidden", 403);
      return { meta: { id: 1, full_name: "example/repository" }, client: { pulls: { get: async () => ({ data: {
        number: 42, state: "open", draft: false, merged: false, head: { sha: head }, base: { repo: { id: 1 } }, html_url: "https://github.com/example/repository/pull/42", ...changes.pr,
      } }) } } };
    },
    reviewBindings: async () => ({ findOne: async () => binding }),
    platformRequest: async (...args) => {
      calls.push(args);
      if (changes.denyTask) throw new SetupError("Forbidden", 403);
      return args[2] === "POST" ? { run_id: "run-1" } : task;
    },
  });
  return calls;
}
test("manual review forwards the original request and a server-fetched PR snapshot", async () => {
  const calls = setup();
  const req = new Request("https://app.example.test/");
  const result = await requestManualReview(req, "example", "repository", 42, body);
  assert.equal(result.run_id, "run-1");
  assert.equal(calls[1][0], req);
  assert.equal(calls[1][1], "/api/autonomous/tasks/review-task/run");
  assert.deepEqual(calls[1][3], { request_id: body.request_id, context: {
    manual_review: true, repository: { id: 1, full_name: "example/repository" },
    pull_request: { number: 42, html_url: "https://github.com/example/repository/pull/42", head: { sha: head }, draft: false, state: "open" },
  } });
  assert.ok(!JSON.stringify(calls).includes("secret"));
});
for (const changes of [
  { denyRepo: true }, { denyTask: true },
  { binding: { state: "disabled" } }, { binding: { full_name: "example/other" } },
  { task: { enabled: false } }, { task: { dynamic_agent_id: "other" } },
  { task: { owner_sub: "other" } }, { task: { description: "unrelated" } },
  { task: { manual_run_context_version: undefined } }, { task: { prompt: "old policy" } },
  { pr: { draft: true } }, { pr: { state: "closed" } }, { pr: { merged: true } },
  { pr: { head: { sha: "b".repeat(40) } } }, { pr: { base: { repo: { id: 2 } } } },
]) test(`ineligible or unauthorized request does not dispatch: ${JSON.stringify(changes)}`, async () => {
  const calls = setup(changes);
  await assert.rejects(requestManualReview(new Request("https://app.example.test/"), "example", "repository", 42, body), SetupError);
  assert.equal(calls.filter((call) => call[2] === "POST").length, 0);
});
test("invalid request identifiers cannot dispatch", async () => {
  const calls = setup();
  await assert.rejects(requestManualReview(new Request("https://app.example.test/"), "example", "repository", 42, { ...body, request_id: "bad" }), SetupError);
  assert.equal(calls.length, 0);
});
