import { createHash } from "node:crypto";
import sources from "./review-upstream-lock.json" with { type: "json" };

// Git blob IDs bind cached bytes to the pinned upstream tree. SHA-256 package
// pins then bind the exact scanned surface selected by the agent owner.
const gitBlob = content => createHash("sha1").update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest("hex");

/** @param {any} row @param {typeof sources[number]} source */
export function validateOriginalHubPackage(row, source) {
  const entry = source.path.slice(source.root.length + 1);
  const files = { ...row.ancillary_files, [entry]: row.content };
  if (Object.hasOwn(row.ancillary_files || {}, entry) || row.scan_status !== "passed" || row.runnable !== true || row.metadata?.hub_type !== "github" ||
    row.metadata?.hub_location !== source.repo || row.metadata?.upstream_revision !== source.revision ||
    row.metadata?.hub_revision !== source.revision || row.metadata?.path !== source.path ||
    row.metadata?.original_content !== true || row.metadata?.upstream_entry_path !== source.path || !/^[a-f0-9]{24}$/.test(row.source_id || "") ||
    row.id !== `hub-${row.source_id}-${row.metadata?.hub_skill_id}` ||
    Object.keys(files).length !== Object.keys(source.files).length ||
    Object.entries(source.files).some(([path, oid]) => typeof files[path] !== "string" || gitBlob(files[path]) !== oid)) {
    throw new Error(`Original upstream skill is blocked, incomplete or changed: ${source.id}`);
  }
  return { content_sha256: createHash("sha256").update(row.content).digest("hex"),
    ancillary_sha256: Object.fromEntries(Object.entries(row.ancillary_files || {}).map(([path, content]) =>
      [path, createHash("sha256").update(/** @type {string} */ (content)).digest("hex")])) };
}

/** Resolve original upstream GitHub Hub packages; no rewritten method copies or runtime downloads.
 * @param {{request: (path:string, method?:string, body?:unknown) => Promise<any>, sources?: typeof sources}} options
 */
export async function resolveReviewHubSkills({ request, sources: expected = sources }) {
  /** @type {Record<string,string>} */
  const ids = {};
  /** @type {Record<string,{content_sha256:string, ancillary_sha256:Record<string,string>}>} */
  const pins = {};
  for (const source of expected) {
    const name = source.path.endsWith("/SKILL.md") ? source.root.split("/").pop() : source.path.split("/").pop()?.replace(/\.md$/, "");
    const rows = [];
    for (let page = 1; page <= 10; page++) {
      const value = await request(`/api/skills?source=github&repo=${encodeURIComponent(source.repo)}&q=${encodeURIComponent(name || "")}&include_content=true&page_size=100&page=${page}`);
      rows.push(...(value.skills || []));
      if (!value.meta?.has_more) break;
      if (page === 10) throw new Error("Review hub catalog is truncated");
    }
    const matches = rows.filter(row => row.source === "hub" && row.metadata?.hub_location === source.repo &&
      row.metadata?.upstream_revision === source.revision && row.metadata?.path === source.path);
    if (matches.length !== 1) throw new Error(`Import and scan the original GitHub Hub skill at its pinned revision: ${source.id}`);
    const row = matches[0];
    pins[row.id] = validateOriginalHubPackage(row, source);
    ids[source.id] = row.id;
  }
  return { ids, pins, sourceRevisions: Object.fromEntries(expected.map(({id, repo, revision, path}) => [id, {repo, revision, path}])) };
}
