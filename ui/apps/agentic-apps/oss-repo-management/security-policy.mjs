const POLICY_PATHS = [".github/security.md", "security.md", "docs/security.md"];

// A shared file-presence signal for community health and foundation readiness.
export async function fetchSecurityPolicy({ client, repo, treeResult }) {
  function inspect(result, source, inheritedFrom = null) {
    const tree = result?.status === "available" && Array.isArray(result.data?.tree) ? result.data.tree : null;
    const files = new Map((tree || []).filter(entry => entry?.type === "blob" && entry.path)
      .map(entry => [String(entry.path).toLowerCase(), String(entry.path)]));
    const path = POLICY_PATHS.map(candidate => files.get(candidate)).find(Boolean);
    if (path) return { status: "present", path, source, inheritedFrom,
      detail: inheritedFrom ? `${path} inherited from public ${inheritedFrom}.` : `${path} detected.` };
    if (!tree || result.data.truncated) return { status: "unavailable", source,
      detail: "Security policy could not be verified because the Git tree was unavailable or incomplete." };
    return null;
  }
  const local = inspect(treeResult, "Git tree");
  if (local) return local;
  const [owner, name] = repo.split("/");
  const missing = { status: "missing", source: "Git trees + public owner defaults",
    detail: "No SECURITY.md found in .github/, root, or docs/, and no eligible public owner default was found." };
  if (name.toLowerCase() === ".github") return missing;
  const defaultRepo = `${owner}/.github`;
  const encodedRepo = `${encodeURIComponent(owner)}/.github`;
  const metadata = await client.tryGet(`/repos/${encodedRepo}`);
  if (metadata.status !== "available") {
    return metadata.httpStatus === 404 ? missing : { status: "unavailable", source: "Public owner defaults",
      detail: "Repository has no local SECURITY.md; the public owner default could not be verified." };
  }
  if (metadata.data?.private === true || ["private", "internal"].includes(metadata.data?.visibility)) return missing;
  if (metadata.data?.private !== false || (typeof metadata.data?.full_name !== "string" || metadata.data.full_name.toLowerCase() !== defaultRepo.toLowerCase()) || !metadata.data?.default_branch) {
    return { status: "unavailable", source: "Public owner defaults", detail: "Public owner default metadata could not be verified." };
  }
  const inheritedTree = await client.tryGet(`/repos/${encodedRepo}/git/trees/${encodeURIComponent(metadata.data.default_branch)}?recursive=1`);
  return inspect(inheritedTree, "Public owner default Git tree", defaultRepo) || missing;
}

// Self-contained: also serialized into the browser for saved snapshots and exports.
export function reconcileSecurityPolicy(dashboard) {
  const value = dashboard || {};
  const community = value.community || {};
  const readiness = value.readiness || {};
  const checks = Array.isArray(readiness.checks) ? readiness.checks : [];
  const previous = checks.find(check => check.criterion === "Security policy");
  let policy = community.securityPolicy;
  if (!["present", "missing", "unavailable"].includes(policy?.status)) {
    policy = previous?.status === "pass"
      ? { status: "present", source: previous.source || "Saved readiness evidence", detail: previous.evidence || "Security policy detected in saved readiness evidence." }
      : { status: "unavailable", source: "Saved report", detail: "Regenerate this report to verify local and inherited SECURITY.md evidence." };
  }
  const updatedChecks = checks.map(check => check.criterion === "Security policy"
    ? { ...check, status: policy.status === "present" ? "pass" : policy.status === "missing" ? "warn" : "unavailable", evidence: policy.detail, source: policy.source }
    : check);
  return {
    ...value,
    community: { ...community, securityPolicy: policy, hasSecurityPolicy: policy.status === "unavailable" ? null : policy.status === "present" },
    readiness: { ...readiness, checks: updatedChecks,
      ...(previous ? { summary: updatedChecks.reduce((counts, check) => { counts[check.status] = (counts[check.status] || 0) + 1; return counts; }, {}) } : {}) },
  };
}
