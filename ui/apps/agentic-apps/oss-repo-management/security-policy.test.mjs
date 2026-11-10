import assert from "node:assert/strict";
import test from "node:test";
import { fetchSecurityPolicy, reconcileSecurityPolicy } from "./security-policy.mjs";
import { buildOssRepoMarkdownReport } from "./markdown-report.mjs";

const tree = (paths = [], truncated = false) => ({ status: "available", data: { tree: paths.map(path => ({ type: "blob", path })), truncated } });
const missingDefault = { status: "unavailable", httpStatus: 404 };
const metadata = { status: "available", data: { full_name: "example/.github", private: false, default_branch: "main" } };
const resolve = (treeResult, results = [missingDefault], repo = "example/project") => {
  const calls = [];
  const client = { tryGet: async path => { calls.push(path); return results.shift(); } };
  return fetchSecurityPolicy({ client, repo, treeResult }).then(policy => ({ policy, calls }));
};

for (const path of ["SECURITY.md", ".github/SECURITY.md", "docs/SECURITY.md", "Docs/Security.MD"]) {
  test(`detects ${path} independently of the community profile`, async () => {
    const { policy, calls } = await resolve(tree([path]));
    assert.equal(policy.status, "present");
    assert.equal(policy.path, path);
    assert.equal(calls.length, 0);
  });
}

test("uses documented path precedence and positive evidence in truncated trees", async () => {
  const { policy } = await resolve(tree(["SECURITY.md", "docs/SECURITY.md", ".github/SECURITY.md"], true));
  assert.equal(policy.path, ".github/SECURITY.md");
  assert.equal(policy.status, "present");
});

test("inherits public owner policy after a complete negative local tree", async () => {
  const { policy, calls } = await resolve(tree(), [metadata, tree(["docs/SECURITY.md"])]);
  assert.equal(policy.status, "present");
  assert.equal(policy.inheritedFrom, "example/.github");
  assert.match(policy.detail, /docs\/SECURITY.md inherited/);
  assert.deepEqual(calls, ["/repos/example/.github", "/repos/example/.github/git/trees/main?recursive=1"]);
});

for (const [description, result] of [
  ["missing public default", missingDefault],
  ["private default", { status: "available", data: { ...metadata.data, private: true } }],
  ["internal default", { status: "available", data: { ...metadata.data, visibility: "internal" } }],
]) {
  test(`reports missing only with complete negative evidence: ${description}`, async () => {
    assert.equal((await resolve(tree(), [result])).policy.status, "missing");
  });
}

test("complete owner tree without a policy is missing; owner repo does not recurse", async () => {
  assert.equal((await resolve(tree(), [metadata, tree()])).policy.status, "missing");
  const { policy, calls } = await resolve(tree(), [], "example/.github");
  assert.equal(policy.status, "missing");
  assert.deepEqual(calls, []);
});

for (const [description, result] of [
  ["denied", { status: "unavailable", httpStatus: 403 }],
  ["network failure", { status: "unavailable" }],
  ["malformed", { status: "available", data: {} }],
  ["truncated", tree([], true)],
]) {
  test(`${description} local evidence is not absence`, async () => {
    const { policy, calls } = await resolve(result);
    assert.equal(policy.status, "unavailable");
    assert.equal(calls.length, 0);
  });
  test(`${description} owner evidence is not absence`, async () => {
    const results = description === "malformed" ? [result] : description === "truncated" ? [metadata, result] : [result];
    assert.equal((await resolve(tree(), results)).policy.status, "unavailable");
  });
}

test("saved contradictory snapshot is reconciled without mutation, including Markdown", () => {
  const saved = { repo: "example/project", community: { hasSecurityPolicy: false }, readiness: {
    checks: [{ criterion: "Security policy", status: "pass", evidence: "SECURITY.md detected.", source: "Git tree" }], summary: { pass: 1 },
  } };
  const normalized = reconcileSecurityPolicy(saved);
  assert.equal(normalized.community.hasSecurityPolicy, true);
  assert.equal(saved.community.hasSecurityPolicy, false);
  assert.equal(normalized.readiness.checks[0].evidence, normalized.community.securityPolicy.detail);
  const markdown = buildOssRepoMarkdownReport(saved, { reportOrigin: "cached" });
  assert.match(markdown, /\| Security policy \| Present \|/);
  assert.match(markdown, /SECURITY.md detected/);
});

test("old negative snapshots become not verified and readiness counts agree", () => {
  const normalized = reconcileSecurityPolicy({ community: { hasSecurityPolicy: false }, readiness: {
    checks: [{ criterion: "Security policy", status: "warn" }, { criterion: "Project license", status: "pass" }], summary: { warn: 1, pass: 1 },
  } });
  assert.equal(normalized.community.hasSecurityPolicy, null);
  assert.equal(normalized.readiness.checks[0].status, "unavailable");
  assert.deepEqual(normalized.readiness.summary, { unavailable: 1, pass: 1 });
  assert.match(buildOssRepoMarkdownReport(normalized), /\| Security policy \| Not verified \|/);
});

for (const [status, expected] of [["present", "pass"], ["missing", "warn"], ["unavailable", "unavailable"]]) {
  test(`new ${status} evidence is shared across sections and survives normalization`, () => {
    const policy = { status, source: "Git tree", detail: "Evidence text" };
    const normalized = reconcileSecurityPolicy({ community: { securityPolicy: policy }, readiness: { checks: [{ criterion: "Security policy", status: "warn" }] } });
    assert.equal(normalized.readiness.checks[0].status, expected);
    assert.equal(normalized.readiness.checks[0].evidence, policy.detail);
    assert.deepEqual(reconcileSecurityPolicy(normalized), normalized);
  });
}
