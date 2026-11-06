import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { resolveReviewHubSkills } from "./src/lib/agentic-sdlc/review-gateway-skills.mjs";
const hubId = "a".repeat(24), revision = "b".repeat(40);
const original = "---\nname: review\n---\nOriginal upstream instructions, unchanged.\n";
const reference = "Original supporting reference.\n";
const blob = text => createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest("hex");
const source = { id: "example-review", repo: "example/skills", revision, root: "skills/review", path: "skills/review/SKILL.md",
  files: { "SKILL.md": blob(original), "references/check.md": blob(reference) } };
function catalog() {
  return [{ id: `hub-${hubId}-review`, source: "hub", source_id: hubId,
    metadata: { hub_type: "github", hub_location: source.repo, hub_skill_id: "review", hub_revision: revision,
      upstream_revision: revision, original_content: true, upstream_entry_path: source.path, path: source.path },
    content: original, ancillary_files: {"references/check.md": reference}, scan_status: "passed", runnable: true }];
}
const resolve = request => resolveReviewHubSkills({request, sources:[source]});
test("onboarding attaches original scanned Hub bytes and pins the complete package without creating copies", async () => {
  const rows = catalog(), calls = [];
  const result = await resolve(async (...args) => { calls.push(args); return {skills: rows}; });
  assert.deepEqual(Object.values(result.ids), [rows[0].id]);
  assert.equal(result.pins[rows[0].id].content_sha256, createHash("sha256").update(original).digest("hex"));
  assert.equal(Object.keys(result.pins[rows[0].id].ancillary_sha256).length, 1);
  assert.ok(calls.every(([path, method]) => path.startsWith("/api/skills?source=github") && !method));
  assert.equal(rows[0].content, original);
});
for (const kind of ["blocked", "unscanned", "shortened", "ancillary", "missing-file", "missing", "duplicate", "wrong-revision", "identity", "shadow-entry"]) {
  test(`original Hub resolution fails closed for ${kind}`, async () => {
    const rows = catalog(), row = rows[0];
    if (kind === "blocked") row.runnable = false;
    if (kind === "unscanned") row.scan_status = "unscanned";
    if (kind === "shortened") row.content = "Shortened adaptation with the same source URL";
    if (kind === "ancillary") row.ancillary_files["references/check.md"] = "changed";
    if (kind === "missing-file") row.ancillary_files = {};
    if (kind === "missing") rows.shift();
    if (kind === "duplicate") rows.push(row);
    if (kind === "wrong-revision") row.metadata.upstream_revision = "c".repeat(40);
    if (kind === "identity") row.id = "different";
    if (kind === "shadow-entry") { row.content = "Changed"; row.ancillary_files["SKILL.md"] = original; }
    await assert.rejects(resolve(async () => ({skills: rows})));
  });
}
test("lookup handles pagination and refuses truncated catalogs", async () => {
  let page = 0;
  assert.equal(Object.keys((await resolve(async () => ++page === 1 ? {skills:[],meta:{has_more:true}} : {skills:catalog()})).ids).length, 1);
  await assert.rejects(resolve(async () => ({skills:[],meta:{has_more:true}})), /truncated/);
});
