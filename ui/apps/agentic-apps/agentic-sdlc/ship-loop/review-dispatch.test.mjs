import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { registerHooks } from "node:module";
import test from "node:test";
import { resetFixture, setFixture } from "./fixtures/review-dispatch.mjs";
import { eligibleReviewEvent, reviewTriggerFilter } from "./src/lib/agentic-sdlc/review-eligibility.ts";

const dispatcherUrl = new URL("./src/lib/agentic-sdlc/review-dispatch.ts", import.meta.url).href;
const fixtureUrl = new URL("./fixtures/review-dispatch.mjs", import.meta.url).href;
const eligibilityUrl = new URL("./src/lib/agentic-sdlc/review-eligibility.ts", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === dispatcherUrl) {
      if (specifier === "./review-eligibility")
        return { url: eligibilityUrl, shortCircuit: true };
      if (["./mongo-collections", "./platform-client", "./review-bindings"].includes(specifier))
        return { url: fixtureUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
let reviewDispatcher;
try {
  reviewDispatcher = await import("./src/lib/agentic-sdlc/review-dispatch.ts");
} finally {
  hooks.deregister();
}
const head = "a".repeat(40);
const payload = (draft = false) => ({
  action: "synchronize",
  repository: { full_name: "example/repository" },
  pull_request: { state: "open", draft, head: { sha: head } },
});

for (const action of ["opened", "synchronize", "ready_for_review"]) {
  test(`${action} can review an open non-draft PR`, () => {
    assert.equal(eligibleReviewEvent("pull_request", action, payload()), true);
  });
  test(`${action} never reviews a draft PR`, () => {
    assert.equal(eligibleReviewEvent("pull_request", action, payload(true)), false);
  });
}

test("incomplete or unrelated events are not review candidates", () => {
  for (const value of [null, {}, { pull_request: {} }, { pull_request: [] }]) {
    assert.equal(eligibleReviewEvent("pull_request", "opened", value), false);
  }
  for (const patch of [
    { draft: undefined },
    { draft: "false" },
    { draft: 0 },
    { state: "closed" },
    { merged: true },
    { head: { sha: "invalid" } },
  ]) {
    const value = payload();
    Object.assign(value.pull_request, patch);
    assert.equal(eligibleReviewEvent("pull_request", "opened", value), false);
  }
  assert.equal(eligibleReviewEvent("issues", "opened", payload()), false);
  for (const action of ["edited", "converted_to_draft", "closed", null]) {
    assert.equal(eligibleReviewEvent("pull_request", action, payload()), false);
  }
});

test("native task filters require the selected repository, an open non-draft PR and review actions", () => {
  const conditions = reviewTriggerFilter("example/repository").conditions;
  assert.deepEqual(conditions.find((c) => c.field === "repository.full_name"), {
    source: "payload", field: "repository.full_name", values: ["example/repository"],
  });
  assert.deepEqual(conditions.find((c) => c.field === "X-GitHub-Event").values, ["pull_request"]);
  assert.deepEqual(conditions.find((c) => c.field === "action").values, ["opened", "synchronize", "ready_for_review"]);
  assert.deepEqual(conditions.find((c) => c.field === "pull_request.draft").values, ["false"]);
  assert.deepEqual(conditions.find((c) => c.field === "pull_request.state").values, ["open"]);
});

async function dispatchFixture(t, changes = {}) {
  const row = {
    _id: "stored-event",
    repo_id: "repo-id",
    github_event_type: "pull_request",
    github_action: "synchronize",
    github_delivery_id: "original-delivery",
    payload: payload(),
    delivered_at: new Date("2026-11-02T12:00:00Z"),
    review_dispatch: { task_id: "review-task", state: "pending", attempts: 1 },
    ...changes,
  };
  const eventUpdates = [], bindingUpdates = [];
  let bindingReads = 0;
  const binding = {
    repo_id: "repo-id", task_id: "review-task", state: "enabled",
    enabled_at: new Date("2026-11-01T12:00:00Z"), secret: { data: "test" },
  };
  const mocks = {
    getAgenticSdlcEventsCollection: async () => ({
      updateMany: async () => ({ matchedCount: 0 }),
      find: () => ({ toArray: async () => [{ _id: row._id }] }),
      findOneAndUpdate: async () => row,
      updateOne: async (...args) => { eventUpdates.push(args); return { matchedCount: 1 }; },
    }),
    managedReviewTask: () => null,
    reviewBindings: async () => ({
      findOne: async () => { bindingReads++; return binding; },
      updateOne: async (...args) => { bindingUpdates.push(args); return { matchedCount: 1 }; },
    }),
    openReviewSecret: () => "fixture-signing-secret",
  };
  setFixture(mocks);
  t.after(resetFixture);
  const oldOrigin = process.env.AGENTIC_SDLC_AUTONOMOUS_ORIGIN;
  process.env.AGENTIC_SDLC_AUTONOMOUS_ORIGIN = "https://autonomous.example.test";
  t.after(() => {
    if (oldOrigin === undefined) delete process.env.AGENTIC_SDLC_AUTONOMOUS_ORIGIN;
    else process.env.AGENTIC_SDLC_AUTONOMOUS_ORIGIN = oldOrigin;
  });
  const requests = [];
  t.mock.method(globalThis, "fetch", async (...args) => {
    requests.push(args);
    return new Response(null, { status: 202 });
  });
  return { module: reviewDispatcher, row, binding, eventUpdates, bindingUpdates, requests, bindingReads: () => bindingReads };
}

test("a new draft delivery is rejected before looking up its enabled binding", async (t) => {
  const fixture = await dispatchFixture(t);
  const dispatch = await fixture.module.prepareReviewDispatch("repo-id", "example/repository", "pull_request", "synchronize", payload(true));
  assert.equal(dispatch, undefined);
  assert.equal(fixture.bindingReads(), 0);
  assert.equal(fixture.requests.length, 0);
});

test("marking a PR ready prepares a dispatch for its existing enabled binding", async (t) => {
  const fixture = await dispatchFixture(t);
  const dispatch = await fixture.module.prepareReviewDispatch("repo-id", "example/repository", "pull_request", "ready_for_review", payload());
  assert.equal(dispatch.task_id, "review-task");
  assert.equal(dispatch.state, "pending");
  assert.equal(fixture.bindingReads(), 1);
});

for (const changes of [
  { payload: payload(true) },
  { payload: { pull_request: { state: "open", head: { sha: head } } } },
  { github_action: "edited" },
  { github_event_type: "issues" },
]) {
  test(`queued ineligible delivery is skipped during recovery: ${JSON.stringify(changes)}`, async (t) => {
    const fixture = await dispatchFixture(t, changes);
    await fixture.module.recoverReviewDispatches();
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.bindingReads(), 0);
    assert.equal(fixture.eventUpdates.at(-1)[1].$set["review_dispatch.state"], "skipped");
  });
}

test("recovery forwards an eligible ready event with its original delivery identity and valid signature", async (t) => {
  const readyPayload = { ...payload(), action: "ready_for_review" };
  const fixture = await dispatchFixture(t, { github_action: "ready_for_review", payload: readyPayload });
  await fixture.module.recoverReviewDispatches();
  assert.equal(fixture.requests.length, 1);
  const [url, request] = fixture.requests[0];
  assert.equal(String(url), "https://autonomous.example.test/api/v1/hooks/review-task");
  assert.equal(request.headers["X-GitHub-Delivery"], "original-delivery");
  assert.deepEqual(JSON.parse(request.body), readyPayload);
  assert.equal(request.headers["X-Hub-Signature-256"], `sha256=${createHmac("sha256", "fixture-signing-secret").update(request.body).digest("hex")}`);
  assert.equal(fixture.eventUpdates.at(-1)[1].$set["review_dispatch.state"], "accepted");
});

test("an eligible event queued before review activation stays skipped", async (t) => {
  const fixture = await dispatchFixture(t, { delivered_at: new Date("2026-10-01T12:00:00Z") });
  await fixture.module.recoverReviewDispatches();
  assert.equal(fixture.requests.length, 0);
  assert.equal(fixture.eventUpdates.at(-1)[1].$set["review_dispatch.state"], "skipped");
});
