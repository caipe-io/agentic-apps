import assert from "node:assert/strict";
import test from "node:test";
import { reviewWorkspaceLink, reviewPrompt, reviewSystem, REVIEW_TOOLS } from "./src/lib/agentic-sdlc/review-policy.ts";

test("an unconfigured workspace adds no link", () => {
  assert.equal(reviewWorkspaceLink(), "");
  assert.equal(reviewWorkspaceLink("  "), "");
});

test("a configured HTTPS workspace keeps its exact destination and handles Markdown parentheses", () => {
  const url = "https://review.example.test/apps/review(workspace)";
  assert.ok(reviewWorkspaceLink(url).includes(`](<${url}>)`));
});

test("workspace links reject non-HTTPS URLs, credentials and private URL parameters", () => {
  for (const url of [
    "javascript:alert(1)",
    "http://review.example.test/",
    "https://user:password@review.example.test/",
    "https://review.example.test/?token=example",
    "https://review.example.test/#secret",
    "not a URL",
  ]) assert.throws(() => reviewWorkspaceLink(url));
});


test("start status uses a PR-body eyes reaction, not an extra comment", () => {
  const prompt = reviewPrompt("example/repository", "review-task");
  assert.ok(REVIEW_TOOLS.includes("add_issue_comment"));
  assert.match(prompt, /reaction="eyes", omitting body and comment_id/);
  assert.match(prompt, /Recheck eligibility\/head immediately before this write/);
  assert.match(prompt, /GitHub deduplicates the same account\/reaction/);
  assert.match(prompt, /If the reaction fails.*continue inspection/);
});

test("completed clean heads publish once while incomplete and stale reviews stay guarded", () => {
  for (const prompt of [reviewPrompt("example/repository", "review-task"), reviewSystem("example/repository")]) {
    assert.match(prompt, /publish exactly one concise COMMENT review/);
    assert.match(prompt, /Incomplete inspection is not a clean result/);
    assert.match(prompt, /existing matching task\/head marker/);
    assert.match(prompt, /discard superseded work/);
    assert.doesNotMatch(prompt, /do not create or submit a GitHub review or comment, even on the first eligible head/);
  }
  assert.match(reviewPrompt("example/repository", "review-task"), /Recheck every earlier unresolved finding/);
});

test("manual re-review inspects an already reviewed commit without repeating public results", () => {
  const prompt = reviewPrompt("example/repository", "review-task");
  assert.match(prompt, /caipe-pr-manual-review-policy:v1/);
  assert.match(prompt, /_caipe_manual_request.source=authenticated_ui/);
  assert.match(prompt, /If the head changed, record skipped/);
  assert.match(prompt, /marker suppresses duplicate publication, not inspection/);
  for (const policy of [prompt, reviewSystem("example/repository")]) {
    assert.match(policy, /inspect the source again even when this task\/head marker exists/);
    assert.match(policy, /never an unchanged clean status or repeated finding/);
  }
});


test("gateway methods replace inline method copies without weakening publication guards", async () => {
  const { CONFORMANCE_SKILL, REVIEW_METHODS_POLICY } = await import("./src/lib/agentic-sdlc/review-policy.ts");
  for (const prompt of [CONFORMANCE_SKILL, reviewSystem("example/repository"), reviewPrompt("example/repository", "task")]) {
    assert.ok(!prompt.includes(REVIEW_METHODS_POLICY));
    assert.doesNotMatch(prompt, /Privately inventory every changed file/);
    assert.match(prompt, /use read_file to read all five attached method/);
    assert.match(prompt, /do not fall back to an old inline method copy/i);
    assert.match(prompt, /missing, blocked, unreadable or truncated/);
    assert.match(prompt, /Incomplete inspection is not a clean result/);
    assert.match(prompt, /at most five new inline findings/);
  }
});


test("skills replace the legacy methodology in all runtime prompt copies", async () => {
  const { CONFORMANCE_SKILL } = await import("./src/lib/agentic-sdlc/review-policy.ts");
  for (const prompt of [CONFORMANCE_SKILL, reviewSystem("example/repository"), reviewPrompt("example/repository", "task")]) {
    assert.doesNotMatch(prompt, /caipe-pr-inspection-policy:v2/);
    assert.doesNotMatch(prompt, /Focus on two kinds of actionable findings/);
    assert.match(prompt, /caipe-pr-review-runtime:v1/);
    assert.match(prompt, /caipe-pr-gateway-skills:v1/);
    assert.match(prompt, /code search is discovery/);
  }
});


test("open findings remain prominent and cannot use a clean headline", async () => {
  const { CONFORMANCE_SKILL } = await import("./src/lib/agentic-sdlc/review-policy.ts");
  for (const prompt of [CONFORMANCE_SKILL, reviewSystem("example/repository"), reviewPrompt("example/repository", "task")]) {
    assert.match(prompt, /M previously reported findings remain · 0 new/);
    assert.match(prompt, /This is a findings outcome, not a clean review/);
    assert.match(prompt, /Use this clean headline only after required prior findings were verified fixed or absent/);
    assert.match(prompt, /Do not call a finding fixed because its thread is resolved or outdated/);
    assert.match(prompt, /If an earlier finding cannot be rechecked.*incomplete privately/);
    assert.match(prompt, /link.*existing threads/);
    assert.doesNotMatch(prompt, /start with \*\*🔎 Agentic SDLC review · No new actionable findings/);
    assert.doesNotMatch(prompt, /say "No new actionable findings; previously reported findings remain open"/);
  }
});


test("skill provenance records actual method use without allowing backfill or extra posts", async () => {
  const { CONFORMANCE_SKILL } = await import(
    "./src/lib/agentic-sdlc/review-policy.ts"
  );
  const prompt = reviewPrompt("example/repository", "trusted-task");
  for (const value of [
    CONFORMANCE_SKILL,
    reviewSystem("example/repository"),
    prompt,
  ]) {
    assert.match(value, /Never infer skill use or discovery/);
    assert.match(value, /only attach provenance to a review or new finding/);
    assert.match(
      value,
      /Never edit or repost old reviews\/findings to backfill/,
    );
    assert.match(
      value,
      /Every listed method must also appear in that review's used array/,
    );
    assert.match(value, /not proof of a separate skill invocation/);
  }
  assert.match(prompt, /caipe-pr-skills:v1 {"task":"trusted-task"/);
  assert.match(prompt, /caipe-pr-finding-skills:v1 {"task":"trusted-task"/);
});
