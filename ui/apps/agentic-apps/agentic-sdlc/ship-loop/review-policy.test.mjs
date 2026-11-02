import assert from "node:assert/strict";
import test from "node:test";
import { reviewWorkspaceLink } from "./src/lib/agentic-sdlc/review-policy.ts";

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
