import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { setFixture } from "./fixtures/pr-dashboard.mjs";
const sourceUrl = new URL(
  "./src/lib/agentic-sdlc/pr-dashboard.ts",
  import.meta.url,
).href;
const fixtureUrl = new URL("./fixtures/pr-dashboard.mjs", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (
      context.parentURL === sourceUrl &&
      ["./review-bindings", "./agentic-sdlc-auth", "@octokit/rest"].includes(
        specifier,
      )
    )
      return { url: fixtureUrl, shortCircuit: true };
    return next(specifier, context);
  },
});
let getPrDashboard;
try {
  ({ getPrDashboard } = await import("./src/lib/agentic-sdlc/pr-dashboard.ts"));
} finally {
  hooks.deregister();
}
const head = "a".repeat(40),
  old = "b".repeat(40);
function fixture() {
  const usage = `<!-- caipe-pr-skills:v1 ${JSON.stringify({ task: "task", head, used: ["sentry-find-bugs", "trailofbits-fp-check"] })} -->`;
  return {
    binding: { task_id: "task", github_login: "bot" },
    pr: {
      number: 1,
      title: "Example",
      html_url: "https://github.com/example/repo/pull/1",
      user: { login: "author" },
      base: { repo: { id: 1 } },
      head: { sha: head },
      labels: [],
      state: "open",
      updated_at: "2026-11-03T12:00:00Z",
    },
    reviews: [
      {
        id: 10,
        user: { login: "bot" },
        state: "COMMENTED",
        commit_id: head,
        html_url: "https://github.com/example/repo/pull/1#pullrequestreview-10",
        body: `<!-- caipe-pr-review:task=task;head=${head} -->\n${usage}\nA finding.`,
      },
    ],
    comments: [
      {
        id: 20,
        pull_request_review_id: 10,
        user: { login: "bot" },
        commit_id: head,
        original_commit_id: head,
        path: "route.js",
        line: 2,
        html_url: "https://github.com/example/repo/pull/1#discussion_r20",
        body: `Evidence\n<!-- caipe-pr-finding-skills:v1 ${JSON.stringify({ task: "task", head, found_by: ["sentry-find-bugs"], verified_by: ["trailofbits-fp-check"] })} -->`,
      },
    ],
  };
}
async function project(f) {
  setFixture(f);
  return (
    await getPrDashboard(new Request("https://example.test"), "example", "repo")
  ).items[0];
}

test("dashboard projects recorded current-head usage and original finding attribution", async () => {
  const row = await project(fixture());
  assert.equal(row.agent_review.skills.status, "reported");
  assert.equal(row.reviews[0].skills.used.length, 2);
  assert.equal(row.comments[0].skills.foundBy[0].id, "sentry-find-bugs");
  assert.equal(row.comments[0].body, "Evidence");
  assert.equal(row.reviews[0].body, "A finding.");
});

test("an old comment mapped onto a newer diff retains original attribution", async () => {
  const f = fixture();
  f.pr.head.sha = old;
  f.comments[0].commit_id = old;
  const row = await project(f);
  assert.equal(row.agent_review.skills.status, "not_recorded");
  assert.equal(row.comments[0].skills.headSha, head);
});

test("spoofed authors, absent parent reviews and wrong original commits cannot claim attribution", async () => {
  for (const change of [
    (f) => {
      f.reviews[0].user.login = "intruder";
    },
    (f) => {
      f.comments[0].user.login = "intruder";
    },
    (f) => {
      f.comments[0].pull_request_review_id = 99;
    },
    (f) => {
      f.comments[0].original_commit_id = old;
    },
    (f) => {
      f.reviews[0].body += `<!-- caipe-pr-review:task=task;head=${head} -->`;
    },
  ]) {
    const f = fixture();
    change(f);
    const row = await project(f);
    assert.equal(row.comments[0].skills.status, "unverified");
    assert.deepEqual(row.comments[0].skills.foundBy, []);
  }
});

test("legacy reviews do not inherit the configured catalog as used skills", async () => {
  const f = fixture();
  f.reviews[0].body = `<!-- caipe-pr-review:task=task;head=${head} --> Legacy review`;
  f.comments[0].body = "Legacy finding";
  const row = await project(f);
  assert.equal(row.agent_review.skills.status, "not_recorded");
  assert.equal(row.comments[0].skills.status, "not_recorded");
});

test("pending, dismissed and approval reviews do not establish skill attribution", async () => {
  for (const state of ["PENDING", "DISMISSED", "APPROVED"]) {
    const f = fixture();
    f.reviews[0].state = state;
    const row = await project(f);
    assert.equal(row.comments[0].skills.status, "unverified");
  }
});

test("a capped review page cannot claim the latest current-head skill report", async () => {
  const f = fixture();
  f.reviews = Array.from({ length: 100 }, (_, i) => ({
    ...f.reviews[0],
    id: i + 10,
  }));
  const row = await project(f);
  assert.equal(row.agent_review.skills.status, "unverified");
  assert.ok(row.missing_signals.includes("reviews exceed page limit"));
});


test("hidden provenance does not cause a false summary-truncated notice", async () => {
  const f = fixture(); f.reviews[0].body += "x".repeat(5800);
  const row = await project(f);
  assert.ok(row.reviews[0].body.length < 6000);
  assert.equal(row.reviews[0].body_truncated, false);
});
