import test from "node:test";
import assert from "node:assert/strict";
import { buildGithubPermissionsRequest, renderSecopsDashboard } from "./dashboard.mjs";

test("GitHub permission chat keeps an unavailable review and the selected repository in context", () => {
  const request = buildGithubPermissionsRequest({ repository: "example/repo", snapshot: { status: "unavailable", error: "Repository metadata unavailable or access denied.", data: null }, agentId: "agent-github" });
  assert.equal(request.agentId, "agent-github");
  assert.deepEqual(request.clientContext.snapshot, { repository: "example/repo", status: "unavailable", error: "Repository metadata unavailable or access denied.", limitation: null, checks: null });
  assert.match(request.message, /Do not change permissions or settings unless I explicitly request it/);
});

test("GitHub permission chat preserves unknown controls and excludes unrelated source fields", () => {
  const request = buildGithubPermissionsRequest({ repository: "example/repo", snapshot: { status: "partial", data: { checks: { branchProtection: "present", requiredChecks: "unknown", unnecessary: "excluded" }, limitation: "Some protection details are unavailable.", privateData: "excluded" } }, agentId: "agent-github" });
  assert.equal(request.clientContext.snapshot.checks.requiredChecks, "unknown");
  assert.equal(request.clientContext.snapshot.checks.pullRequests, "unknown");
  assert.doesNotMatch(JSON.stringify(request.clientContext), /excluded/);
});

test("the dashboard offers GitHub permission chat after a review", () => {
  const html = renderSecopsDashboard({ configuration: { accounts: [], regions: [], repos: ["example/repo"], githubAgentId: "agent-github" }, basePath: "/apps/secops", appPath: "/apps/secops" });
  assert.match(html, /Chat about permissions with GitHub Agent/);
  assert.match(html, /githubReviewed = true/);
  assert.match(html, /\/chat\//);
});
