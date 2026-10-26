/** Deployment-owned repository allowlist; tag values can select, never expand, it. */
export function infrastructureSourceConfiguration(input = {}) {
  const defaults = {
    repository: ["git:repository", "Repository", "GitRepository", "terraform:repository"],
    path: ["git:path", "TerraformPath"], ref: ["git:ref", "GitRef"],
    workspace: ["terraform:workspace", "TerraformWorkspace"],
    address: ["terraform:resource", "TerraformResource"],
    owner: ["Owner", "ResourceOwner", "Team"], managedBy: ["ManagedBy", "managed-by"],
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid infrastructure source configuration.");
  const repositories = input.repositories || [];
  if (!Array.isArray(repositories) || repositories.length > 64) throw new Error("Configure at most 64 source repositories.");
  const ids = new Set(), urls = new Set();
  const normalized = repositories.map((repository) => {
    const url = new URL(repository.url);
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(repository.id || "") || ids.has(repository.id) || url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || !/^\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/?$/.test(url.pathname)) throw new Error("Configure unique repository IDs and HTTPS GitHub-compatible repository URLs.");
    const canonical = url.origin + url.pathname.replace(/\/$/, "").replace(/\.git$/, "");
    if (urls.has(canonical.toLowerCase())) throw new Error("Configure each source repository once.");
    const ref = repository.ref || "main";
    if (!/^[a-zA-Z0-9_./-]{1,200}$/.test(ref) || ref.includes("..")) throw new Error("Invalid repository ref.");
    ids.add(repository.id); urls.add(canonical.toLowerCase());
    return { id: repository.id, url: canonical, ref };
  });
  const tagKeys = {};
  for (const [kind, fallback] of Object.entries(defaults)) {
    const keys = input.tagKeys?.[kind] ?? fallback;
    if (!Array.isArray(keys) || !keys.length || keys.length > 8 || keys.some((key) => typeof key !== "string" || !key || key.length > 128)) throw new Error("Invalid infrastructure source tag keys.");
    tagKeys[kind] = [...new Set(keys)];
  }
  return { enabled: normalized.length > 0, repositories: normalized, tagKeys };
}

/** Browser-safe: derives links only from configured repositories and cached resource tags. */
export function correlateInfrastructureSource(resource, configuration) {
  const unknown = (reason) => ({ status: "unknown", reason, observedAt: resource?.retrievedAt || null });
  if (!configuration?.enabled) return unknown("Infrastructure source repositories are not configured.");
  const evidence = [];
  const values = (kind) => {
    const tags = (resource.tags || []).filter((tag) => configuration.tagKeys[kind].includes(tag.key) && typeof tag.value === "string" && tag.value.trim());
    evidence.push(...tags.map(({ key, value }) => ({ key, value })));
    return [...new Set(tags.map((tag) => tag.value.trim()))];
  };
  const repoTags = values("repository");
  if (!repoTags.length) return unknown("No configured repository tag was reported. This does not prove the resource is unmanaged.");
  const canonical = (value) => value.replace(/\/$/, "").replace(/\.git$/, "").toLowerCase();
  const repositories = repoTags.map((value) => configuration.repositories.find((repo) => [repo.id, repo.url, new URL(repo.url).pathname.slice(1)].some((alias) => canonical(alias) === canonical(value))));
  if (repositories.some((repo) => !repo)) return unknown("A repository tag is outside the configured repository allowlist.");
  if (new Set(repositories.map((repo) => repo.id)).size !== 1) return unknown("Conflicting repository tags; source association is ambiguous.");
  const repository = repositories[0], fields = {};
  for (const kind of ["path", "ref", "workspace", "address", "owner", "managedBy"]) {
    const candidates = values(kind);
    if (candidates.length > 1) return unknown("Conflicting " + kind + " tags; source association is ambiguous.");
    fields[kind] = candidates[0] || "";
    if (fields[kind].length > 512 || /[\u0000-\u001f\u007f]/.test(fields[kind])) return unknown("Invalid source metadata tag.");
  }
  const ref = fields.ref || repository.ref;
  if (!/^[a-zA-Z0-9_./-]{1,200}$/.test(ref) || ref.includes("..")) return unknown("Invalid source ref tag.");
  const segments = fields.path.split("/");
  if (fields.path && (fields.path.startsWith("/") || segments.some((segment) => !segment || segment === "." || segment === ".." || /[\\%?#:]/.test(segment)))) return unknown("Invalid repository-relative source path tag.");
  const sourceUrl = repository.url + "/" + (/\.(tf|tfvars|hcl|json|ya?ml)$/.test(fields.path) ? "blob" : "tree") + "/" + encodeURIComponent(ref) + (fields.path ? "/" + segments.map(encodeURIComponent).join("/") : "");
  return { status: "tag-provided", repository: repository.id, repositoryUrl: repository.url, sourceUrl, ...fields, ref, evidence, observedAt: resource.retrievedAt || null, reason: "Association comes from resource tags; Terraform state and code drift have not been verified." };
}

/** Shared accessible source card, used by both dashboards; never interpolates raw HTML. */
export function renderInfrastructureSource(source) {
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
  if (source?.status !== "tag-provided") return '<p class="small muted">Source unknown · ' + escape(source?.reason || "No source evidence is available.") + '</p>';
  let url;
  try { url = new URL(source.sourceUrl); } catch { return '<p class="small muted">Source unknown · Invalid source link.</p>'; }
  if (url.protocol !== "https:" || url.username || url.password) return '<p class="small muted">Source unknown · Invalid source link.</p>';
  const fields = [["Workspace", source.workspace], ["Resource address", source.address], ["Owner / team", source.owner], ["Managed by", source.managedBy], ["Observed", source.observedAt]];
  return '<p class="small"><strong>Tag-provided association</strong> · <a href="' + escape(url.href) + '" target="_blank" rel="noopener noreferrer">View code ↗</a></p><p class="small">' + escape(source.repository) + ' · ' + escape(source.ref) + (source.path ? ' · ' + escape(source.path) : ' · Repository root') + '</p>' + fields.filter(([, value]) => value).map(([label, value]) => '<p class="small muted">' + escape(label) + ': ' + escape(value) + '</p>').join("") + '<details><summary>Source evidence</summary><p class="small muted">' + escape(source.reason) + '</p><dl>' + (source.evidence || []).map((tag) => '<dt>' + escape(tag.key) + '</dt><dd>' + escape(tag.value) + '</dd>').join("") + '</dl></details>';
}
