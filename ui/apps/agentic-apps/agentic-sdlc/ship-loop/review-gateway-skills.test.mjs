import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { REVIEW_GATEWAY_SKILLS, ensureReviewGatewaySkills } from "./src/lib/agentic-sdlc/review-gateway-skills.mjs";

function fixture({ failScan = false } = {}) {
  const docs = new Map(), calls = [], saved = [];
  const options = { fullName: "example/repository", bindingKey: "connection", teamSlug: "review-team", ids: {},
    save: async ids => { saved.push(ids); options.ids = ids; },
    request: async (path, method = "GET", body) => {
      calls.push({ path, method });
      if (method === "POST" && path === "/api/skills/configs") {
        const id = `skill-${docs.size}`;
        docs.set(id, { ...body, id, scan_status: "unscanned" });
        return { data: { id } };
      }
      if (path.endsWith("/scan")) {
        const id = path.split("/").at(-2);
        docs.get(id).scan_status = failScan ? "flagged" : "passed";
        return {};
      }
      return docs.get(new URL(path, "https://example.test").searchParams.get("id"));
    },
  };
  return { options, docs, calls, saved };
}

test("each gateway method has separate content, pinned attribution, license and content digest", () => {
  assert.equal(REVIEW_GATEWAY_SKILLS.length, 5);
  assert.equal(new Set(REVIEW_GATEWAY_SKILLS.map(s => s.id)).size, 5);
  for (const skill of REVIEW_GATEWAY_SKILLS) {
    assert.equal(skill.sha256, createHash("sha256").update(skill.content).digest("hex"));
    assert.ok(skill.content.includes(`method_id: ${skill.id}`));
    assert.match(skill.content, /Attribution:/);
    assert.match(skill.url, /[a-f0-9]{40}/);
    assert.ok(skill.ancillary_files["LICENSE.txt"].length > 1000);
  }
  const security = REVIEW_GATEWAY_SKILLS[1], verification = REVIEW_GATEWAY_SKILLS[2];
  assert.match(security.content, /Security regression pass/);
  assert.doesNotMatch(security.content, /Finding verification pass/);
  assert.match(verification.content, /Finding verification pass/);
  assert.doesNotMatch(verification.content, /Bounded variant pass/);
});

test("all five methods are scanned, checkpointed and reused without duplicate writes", async () => {
  const f = fixture();
  const ids = await ensureReviewGatewaySkills(f.options);
  assert.equal(ids.length, 5);
  assert.equal(f.saved.length, 5);
  assert.ok([...f.docs.values()].every(s => s.visibility === "team" && s.shared_with_teams[0] === "review-team" && s.scan_status === "passed"));
  const creates = () => f.calls.filter(c => c.method === "POST" && c.path === "/api/skills/configs").length;
  const writes = creates();
  assert.deepEqual(await ensureReviewGatewaySkills(f.options), ids);
  assert.equal(creates(), writes);
});

test("a scan failure never returns attachment IDs and preserves the ID for retry", async () => {
  const f = fixture({ failScan: true });
  await assert.rejects(ensureReviewGatewaySkills(f.options), /security scan/);
  assert.equal(f.docs.size, 1);
  assert.equal(f.saved.length, 1);
  await assert.rejects(ensureReviewGatewaySkills(f.options), /security scan/);
  assert.equal(f.docs.size, 1);
});

test("changed method content or an unrelated binding fails closed", async () => {
  for (const edit of [s => { s.skill_content += "changed"; }, s => { s.metadata.binding_key = "other"; }, s => { s.ancillary_files = {}; }]) {
    const f = fixture();
    await ensureReviewGatewaySkills(f.options);
    edit(f.docs.get("skill-0"));
    await assert.rejects(ensureReviewGatewaySkills(f.options), /changed or belongs/);
  }
});


test("content changed during a scan cannot become an attachment", async () => {
  const f = fixture();
  const request = f.options.request;
  f.options.request = async (...args) => {
    const result = await request(...args);
    if (args[0].endsWith("/scan")) f.docs.get("skill-0").skill_content += "changed during scan";
    return result;
  };
  await assert.rejects(ensureReviewGatewaySkills(f.options), /changed or belongs/);
});
