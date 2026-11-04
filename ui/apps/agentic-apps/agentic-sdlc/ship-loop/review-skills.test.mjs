import assert from "node:assert/strict";
import test from "node:test";
import {
  reviewSkillReport,
  findingSkillReport,
  stripSkillMetadata,
} from "./src/lib/agentic-sdlc/review-skills.mjs";
const head = "a".repeat(40);
const context = { trusted: true, taskId: "task", headSha: head };
const marker = (kind, value) =>
  `<!-- caipe-pr-${kind}:v1 ${JSON.stringify({ task: "task", head, ...value })} -->`;
const review = marker("skills", {
  used: ["sentry-find-bugs", "trailofbits-fp-check"],
});
const finding = marker("finding-skills", {
  found_by: ["sentry-find-bugs"],
  verified_by: ["trailofbits-fp-check"],
});

test("only recorded, identity-bound skill usage becomes catalog badges", () => {
  const value = reviewSkillReport(review, context);
  assert.equal(value.status, "reported");
  assert.deepEqual(
    value.used.map((s) => s.id),
    ["sentry-find-bugs", "trailofbits-fp-check"],
  );
  assert.ok(value.used.every((s) => s.url.startsWith("https://github.com/")));
  assert.equal(
    reviewSkillReport("A security finding. Sentry was configured.", context)
      .status,
    "not_recorded",
  );
  assert.equal(
    reviewSkillReport(marker("skills", { used: [] }), context).status,
    "reported",
  );
});

test("untrusted authors, wrong tasks and stale commit metadata cannot claim usage", () => {
  for (const changed of [
    { trusted: false },
    { taskId: "other" },
    { headSha: "b".repeat(40) },
    { headSha: "" },
  ]) {
    assert.deepEqual(reviewSkillReport(review, { ...context, ...changed }), {
      status: "unverified",
      used: [],
    });
  }
});

test("malformed, duplicated, oversized and unknown metadata fails closed", () => {
  const bad = [
    review + review,
    review + "<!-- caipe-pr-skills:v1 broken -->",
    "<!-- caipe-pr-skills:v1 {bad} -->",
    "<!-- caipe-pr-skills:v1 " + "x".repeat(2050) + " -->",
    marker("skills", { used: ["unknown-skill"] }),
    marker("skills", { used: ["sentry-find-bugs", "sentry-find-bugs"] }),
    marker("skills", {
      used: ["sentry-find-bugs"],
      url: "javascript:alert(1)",
    }),
    marker("skills", { used: "sentry-find-bugs" }),
  ];
  for (const body of bad)
    assert.deepEqual(reviewSkillReport(body, context), {
      status: "unverified",
      used: [],
    });
});

test("finding attribution must match its original review and applied skill set", () => {
  const parent = reviewSkillReport(review, context);
  const value = findingSkillReport(finding, context, parent);
  assert.equal(value.status, "reported");
  assert.deepEqual(
    value.foundBy.map((s) => s.id),
    ["sentry-find-bugs"],
  );
  assert.deepEqual(
    value.verifiedBy.map((s) => s.id),
    ["trailofbits-fp-check"],
  );
  assert.equal(value.headSha, head);
  for (const body of [
    finding + finding,
    marker("finding-skills", {
      found_by: ["anthropic-code-review"],
      verified_by: [],
    }),
    marker("finding-skills", { found_by: [], verified_by: ["unknown"] }),
  ])
    assert.equal(
      findingSkillReport(body, context, parent).status,
      "unverified",
    );
  assert.equal(
    findingSkillReport(finding, { ...context, trusted: false }, parent).status,
    "unverified",
  );
  assert.equal(
    findingSkillReport(
      finding,
      context,
      reviewSkillReport("old review", context),
    ).status,
    "unverified",
  );
  assert.equal(
    findingSkillReport("old finding", context, parent).status,
    "not_recorded",
  );
});

test("structured metadata is hidden without stripping the finding explanation", () => {
  assert.equal(
    stripSkillMetadata("Bug explanation\n" + review + "\n" + finding),
    "Bug explanation",
  );
});

test("quoted or fenced metadata examples never establish usage and remain visible evidence", () => {
  for (const body of [
    "```text\n" + review + "\n```",
    "~~~\n" + review + "\n~~~",
    "> " + review,
    "    " + review,
    "Example: " + review,
  ]) {
    assert.equal(reviewSkillReport(body, context).status, "not_recorded");
    assert.equal(stripSkillMetadata(body), body.trim());
  }
  assert.equal(
    reviewSkillReport("```text\n" + review + "\n```\n" + review, context)
      .status,
    "reported",
  );
});
