import assert from "node:assert/strict";
import test from "node:test";
import { reviewRunState } from "./src/lib/agentic-sdlc/review-run-state.mjs";
import { reviewRunProgress, resumeReviewRun } from "./src/lib/agentic-sdlc/manual-review-client.ts";
const head = "a".repeat(40), runId = "3236b495-96de-4525-bb9b-4420494bcd05";
const marker = (result, task = "review", sha = head) => `<!-- caipe-pr-verdict:v1;task=${task};head=${sha};result=${result} -->`;
test("transport success cannot hide incomplete, skipped, stale or absent review verdicts", () => {
  for (const [body, expected] of [[marker("incomplete"), "incomplete"], [marker("skipped"), "skipped"],
    [marker("no_findings"), "completed"], [marker("findings"), "completed"], ["Done", "unknown"],
    [marker("no_findings", "other"), "unknown"], [marker("no_findings", "review", "b".repeat(40)), "unknown"],
    [marker("no_findings") + marker("incomplete"), "unknown"]]) {
    assert.equal(reviewRunState({status: "success", response_full: body}, "review", head).state, expected);
  }
});
test("progress belongs to this head and resume requires an explicit backend checkpoint capability", () => {
  const run = { status: "failed", review_execution: { version: 1, state: "incomplete", head, completed: 2, total: 4, resumable: true } };
  assert.equal(reviewRunState(run, "review", head).resumable, true);
  assert.equal(reviewRunState(run, "review", "b".repeat(40)).resumable, false);
  run.review_execution.resumable = false;
  assert.equal(reviewRunState(run, "review", head).resumable, false);
});
test("polling selects only the requested run and resume uses host session authorization", async () => {
  const signal = new AbortController().signal;
  const progress = await reviewRunProgress("review", runId, head, signal, async () => Response.json([
    { run_id: "other", status: "success", response_full: marker("no_findings") },
    { run_id: runId, status: "success", response_full: marker("incomplete") },
  ]));
  assert.equal(progress.state, "incomplete");
  const result = await resumeReviewRun("review", runId, signal, async (path, options) => {
    assert.equal(path, `/api/autonomous/tasks/review/runs/${runId}/resume-review`);
    assert.equal(options.credentials, "same-origin");
    assert.equal(new Headers(options.headers).has("authorization"), false);
    return Response.json({ run_id: runId });
  });
  assert.equal(result.runId, runId);
});
