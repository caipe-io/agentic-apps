import assert from "node:assert/strict";
import test from "node:test";
import { startPreparedReview, reviewRunStatus } from "./src/lib/agentic-sdlc/manual-review-client.ts";
const prepared = { task_id: "review-task", agent_id: "review-agent", owner_sub: "owner-sub", binding_key: "binding-key",
  run_body: { request_id: "b6a6d8ec-8f03-46b7-a21f-09af26d6ee00", context: { manual_review: true } } };
const runId = "3236b495-96de-4525-bb9b-4420494bcd05";
const task = { enabled: true, dynamic_agent_id: "review-agent", owner_sub: "owner-sub", description: "[sdlc-binding:binding-key]",
  manual_run_context_version: 1, prompt: "<!-- caipe-pr-manual-review-policy:v1 -->" };
const signal = new AbortController().signal;
function fixture(changes = {}, status = 200) {
  const calls = [];
  return { calls, request: async (path, options) => {
    calls.push({path, options});
    return Response.json(options.method === "POST" ? {run_id: runId} : {...task, ...changes}, {status});
  } };
}
test("host session authorizes task access and execution without app bearer or bot credentials", async () => {
  const {calls, request} = fixture();
  assert.deepEqual(await startPreparedReview(prepared, signal, request), {taskId: prepared.task_id, runId});
  assert.deepEqual(calls.map(c => c.path), ["/api/autonomous/tasks/review-task", "/api/autonomous/tasks/review-task/run"]);
  for (const {options} of calls) {
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.signal, signal);
    assert.equal(new Headers(options.headers).has("authorization"), false);
    assert.equal(new Headers(options.headers).has("X-Authenticated-User-Is-Admin"), false);
  }
  assert.deepEqual(JSON.parse(calls[1].options.body), prepared.run_body);
});
for (const change of [{enabled:false}, {dynamic_agent_id:"other"}, {owner_sub:"other"}, {description:"other"},
  {manual_run_context_version:undefined}, {prompt:"older policy"}]) {
  test(`no run for mismatched or unsupported reviewer: ${JSON.stringify(change)}`, async () => {
    const {calls, request} = fixture(change);
    await assert.rejects(startPreparedReview(prepared, signal, request));
    assert.equal(calls.length, 1);
  });
}
test("owner/admin denial cannot be bypassed", async () => {
  const {calls, request} = fixture({},403);
  await assert.rejects(startPreparedReview(prepared, signal, request), /ownership.*administrator/);
  assert.equal(calls.length,1);
});
test("retry retains the original request UUID", async () => {
  const {calls, request} = fixture();
  await startPreparedReview(prepared, signal, request);
  await startPreparedReview(prepared, signal, request);
  assert.equal(calls[1].options.body, calls[3].options.body);
});
test("polling uses the same authorized host session and exact run ID", async () => {
  let options;
  const status = await reviewRunStatus(prepared.task_id, runId, signal, async (path, init) => {
    assert.equal(path, "/api/autonomous/tasks/review-task/runs?limit=100"); options=init;
    return Response.json([{run_id:"unrelated",status:"failed"},{run_id:runId,status:"running"}]);
  });
  assert.equal(status,"running"); assert.equal(options.credentials,"same-origin");
});

test("bounded reviewers use the scoped endpoint without the legacy context extension", async () => {
  const {calls, request} = fixture({metadata:{review_execution_version:1},manual_run_context_version:undefined});
  const context = {repository:{full_name:"example/repo"},pull_request:{number:1,head:{sha:"a".repeat(40)}},ignored:"value"};
  await startPreparedReview({...prepared,run_body:{...prepared.run_body,context}},signal,request);
  assert.equal(calls[1].path,"/api/autonomous/tasks/review-task/reviews/run");
  assert.deepEqual(JSON.parse(calls[1].options.body),{request_id:prepared.run_body.request_id,repository:"example/repo",pull_request_number:1,head_sha:"a".repeat(40)});
});
