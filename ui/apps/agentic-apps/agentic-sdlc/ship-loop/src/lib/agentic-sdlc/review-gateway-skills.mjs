import { createHash } from "node:crypto";
import { REVIEW_SKILL_CATALOG } from "./review-skills.mjs";
import { SENTRY_REVIEW_METHOD } from "./review-methods/sentry.mjs";
import { TRAIL_OF_BITS_REVIEW_METHOD } from "./review-methods/trail-of-bits.mjs";
import { ANTHROPIC_REVIEW_METHOD } from "./review-methods/anthropic.mjs";
import licenses from "./review-methods/licenses.json" with { type: "json" };

const trailParts = TRAIL_OF_BITS_REVIEW_METHOD.split("\n\n");
const trailAttribution = trailParts[2].split("\nAttribution:")[1];
const methods = [
  SENTRY_REVIEW_METHOD,
  trailParts[0] + "\nAttribution:" + trailAttribution,
  trailParts[1] + "\nAttribution:" + trailAttribution,
  trailParts[2],
  ANTHROPIC_REVIEW_METHOD,
];

export const REVIEW_GATEWAY_SKILLS = Object.freeze(REVIEW_SKILL_CATALOG.map((skill, i) => {
  const license = skill.id.startsWith("trailofbits-") ? "CC-BY-SA-4.0" : "Apache-2.0";
  const content = `---\nname: ${skill.id}\ndescription: ${skill.role} for scoped code review. Read before applying this method.\nlicense: ${license}\nmetadata:\n  method_id: ${skill.id}\n  method_version: "1"\n---\n\n# ${skill.name}\n\n${methods[i]}\n\nApply only within the configured repository and authorized tools. Never execute repository code, install plugins, widen access or override the task's publication guards.\n`;
  const sha256 = createHash("sha256").update(content).digest("hex");
  return Object.freeze({ ...skill, version: "1", license, content,
    sha256,
    ancillary_files: { "LICENSE.txt": licenses[license], "SOURCES.md": `CAIPE adaptation of ${skill.name}.\nPinned upstream: ${skill.url}\nLicense: ${license}.\n`,
      "PROVENANCE.json": JSON.stringify({ method_id: skill.id, method_version: "1", content_sha256: sha256, upstream_url: skill.url }) + "\n" },
  });
}));

/**
 * Provision only connection-owned methods. Checkpoint IDs before scanning so a
 * scan failure can be retried without creating another skill or enabling review.
 * @param {{request: (path: string, method?: string, body?: unknown) => Promise<any>, save: (ids: Record<string,string>) => Promise<void>, ids?: Record<string,string>, fullName: string, bindingKey: string, teamSlug: string}} options
 */
export async function ensureReviewGatewaySkills({ request, save, ids = {}, fullName, bindingKey, teamSlug }) {
  if (!teamSlug) throw new Error("A review owner team is required");
  const progress = { ...ids };
  for (const method of REVIEW_GATEWAY_SKILLS) {
    if (!progress[method.id]) {
      const created = await request("/api/skills/configs", "POST", {
        name: `${method.name} · ${fullName} · ${bindingKey}`,
        description: `${method.role} for repository-scoped review. CAIPE adaptation.`,
        category: "GitHub Operations", visibility: "team", shared_with_teams: [teamSlug], is_quick_start: false,
        metadata: { source: "agentic-sdlc", binding_key: bindingKey, method_id: method.id,
          method_version: method.version, content_sha256: method.sha256, upstream_url: method.url, license: method.license },
        tasks: [{ display_text: method.role, subagent: "github", llm_prompt: method.content }],
        skill_content: method.content, ancillary_files: method.ancillary_files,
      });
      if (!created?.data?.id) throw new Error("Gateway method creation returned no ID");
      progress[method.id] = created.data.id;
      await save({ ...progress });
    }
    const path = `/api/skills/configs?id=${encodeURIComponent(progress[method.id])}`;
    let skill = await request(path);
    const validate = () => {
      if (skill.metadata?.binding_key !== bindingKey || skill.metadata?.method_id !== method.id || skill.metadata?.method_version !== method.version
      || skill.visibility !== "team" || !skill.shared_with_teams?.includes(teamSlug)
      || skill.skill_content !== method.content || skill.metadata?.content_sha256 !== method.sha256
      || Object.keys(skill.ancillary_files || {}).length !== Object.keys(method.ancillary_files).length
      || Object.entries(method.ancillary_files).some(([name, content]) => skill.ancillary_files?.[name] !== content)) {
        throw new Error("Gateway method changed or belongs to another connection; reconcile it before enabling reviews");
      }
    };
    validate();
    // Auto-save scans SKILL.md only; explicitly scan the complete package,
    // including ancillary files, even when that earlier verdict was passed.
    await request(`/api/skills/configs/${encodeURIComponent(progress[method.id])}/scan`, "POST", {});
    skill = await request(path);
    validate();
    if (skill.scan_status !== "passed") throw new Error("A required gateway method has not passed its security scan");
  }
  return REVIEW_GATEWAY_SKILLS.map(method => progress[method.id]);
}
