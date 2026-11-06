// Reporting aliases for original upstream Hub skills; URLs are source attribution.
/** @typedef {{id: string, name: string, role: string, url: string}} ReviewSkill */
/** @typedef {"reported" | "not_recorded" | "unverified"} SkillReportStatus */
/** @typedef {{status: SkillReportStatus, used: ReviewSkill[]}} ReviewSkillReport */
/** @typedef {{status: SkillReportStatus, foundBy: ReviewSkill[], verifiedBy: ReviewSkill[], headSha: string | null}} FindingSkillReport */
/** @typedef {{trusted: boolean, taskId: string | null, headSha: string}} SkillContext */

export const REVIEW_SKILL_CATALOG = Object.freeze(
  [
    {
      id: "sentry-find-bugs",
      name: "Sentry · Find Bugs",
      role: "Discovery",
      url: "https://github.com/getsentry/skills/blob/0c464f411bdfb8d4c12314b36264d06cb2f60270/skills/find-bugs/SKILL.md",
    },
    {
      id: "trailofbits-differential-review",
      name: "Trail of Bits · Differential Review",
      role: "Security review",
      url: "https://github.com/trailofbits/skills/blob/711af095215ad4ecde5b90cd1d0124b3f1c4ca9e/plugins/differential-review/skills/differential-review/SKILL.md",
    },
    {
      id: "trailofbits-fp-check",
      name: "Trail of Bits · FP Check",
      role: "Verification",
      url: "https://github.com/trailofbits/skills/blob/711af095215ad4ecde5b90cd1d0124b3f1c4ca9e/plugins/fp-check/skills/fp-check/SKILL.md",
    },
    {
      id: "trailofbits-variant-analysis",
      name: "Trail of Bits · Variant Analysis",
      role: "Related-pattern analysis",
      url: "https://github.com/trailofbits/skills/blob/711af095215ad4ecde5b90cd1d0124b3f1c4ca9e/plugins/variant-analysis/skills/variant-analysis/SKILL.md",
    },
    {
      id: "anthropic-code-review",
      name: "Anthropic · Code Review",
      role: "Validation",
      url: "https://github.com/anthropics/claude-plugins-official/blob/a2e251d9b97b909bf728b3e84fc8d17e6aba0063/plugins/code-review/commands/code-review.md",
    },
  ].map((skill) => Object.freeze(skill)),
);
const skillsById = new Map(
  REVIEW_SKILL_CATALOG.map((skill) => [skill.id, skill]),
);

/** Only standalone reporting lines, never quoted or fenced source examples.
 * @param {string} body
 */
function reportingLines(body) {
  let fence = "",
    fenceLength = 0;
  return body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line, index) => {
      if (/^(?: {4}|\t|\s*>)/.test(line)) return null;
      const edge = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (fence) {
        if (
          edge &&
          edge[1][0] === fence &&
          edge[1].length >= fenceLength &&
          !edge[2].trim()
        )
          fence = "";
        return null;
      }
      if (edge) {
        fence = edge[1][0];
        fenceLength = edge[1].length;
        return null;
      }
      return /^<!-- caipe-pr-(?:skills|finding-skills):v1/.test(line)
        ? { line, index }
        : null;
    })
    .filter((line) => line !== null);
}

/** @param {string} body @param {"skills" | "finding-skills"} kind */
function metadata(body, kind) {
  const prefix = `<!-- caipe-pr-${kind}:v1`;
  const lines = reportingLines(body).filter(({ line }) =>
    line.startsWith(prefix),
  );
  if (!lines.length) return { missing: true, value: null };
  if (lines.length !== 1) return { missing: false, value: null };
  const suffix = lines[0].line.slice(prefix.length);
  if (
    !suffix.startsWith(" ") ||
    !suffix.endsWith(" -->") ||
    suffix.length > 2053
  )
    return { missing: false, value: null };
  try {
    const value = JSON.parse(suffix.slice(1, -4));
    return {
      missing: false,
      value:
        value && typeof value === "object" && !Array.isArray(value)
          ? value
          : null,
    };
  } catch {
    return { missing: false, value: null };
  }
}

/** @param {unknown} ids @returns {ReviewSkill[] | null} */
function skillList(ids) {
  if (
    !Array.isArray(ids) ||
    ids.length > REVIEW_SKILL_CATALOG.length ||
    ids.some((id) => typeof id !== "string" || !skillsById.has(id)) ||
    new Set(ids).size !== ids.length
  )
    return null;
  return ids.map((id) => {
    const skill = skillsById.get(id);
    if (!skill) throw new Error("Unknown skill");
    return skill;
  });
}

/** @param {any} value @param {SkillContext} context */
function matches(value, context) {
  return (
    context.trusted &&
    context.taskId &&
    /^[a-f0-9]{40}$/.test(context.headSha) &&
    value?.task === context.taskId &&
    value?.head === context.headSha
  );
}

/** @param {string} body @param {SkillContext} context @returns {ReviewSkillReport} */
export function reviewSkillReport(body, context) {
  const { missing, value } = metadata(body, "skills");
  if (missing) return { status: "not_recorded", used: [] };
  const used = skillList(value?.used);
  if (
    !matches(value, context) ||
    !used ||
    Object.keys(value).some((key) => !["task", "head", "used"].includes(key))
  )
    return { status: "unverified", used: [] };
  return { status: "reported", used };
}

/** @param {string} body @param {SkillContext} context @param {ReviewSkillReport} parent @returns {FindingSkillReport} */
export function findingSkillReport(body, context, parent) {
  const { missing, value } = metadata(body, "finding-skills");
  const empty = { foundBy: [], verifiedBy: [], headSha: null };
  if (missing) return { status: "not_recorded", ...empty };
  const foundBy = skillList(value?.found_by),
    verifiedBy = skillList(value?.verified_by);
  if (
    !matches(value, context) ||
    parent.status !== "reported" ||
    !foundBy ||
    !verifiedBy ||
    Object.keys(value).some(
      (key) => !["task", "head", "found_by", "verified_by"].includes(key),
    ) ||
    [...foundBy, ...verifiedBy].some(
      (skill) => !parent.used.some((used) => used.id === skill.id),
    )
  )
    return { status: "unverified", ...empty };
  return { status: "reported", foundBy, verifiedBy, headSha: context.headSha };
}

/** @param {string} body */
export function stripSkillMetadata(body) {
  const hidden = new Set(reportingLines(body).map(({ index }) => index));
  return body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((_, index) => !hidden.has(index))
    .join("\n")
    .trim();
}
