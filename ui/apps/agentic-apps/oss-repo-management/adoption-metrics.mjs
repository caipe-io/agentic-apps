import { readFileSync } from "node:fs";

/** Search totals are independent of the bounded recent-PR trend sample. */
export async function fetchAdoptionMetrics({ client, repo, createdAt, now, authenticated }) {
  const empty = { pullRequestsOpened: null, pullRequestsMerged: null, monthlyPullRequestsOpened: [], coverage: "A GitHub credential is required for adoption counts." };
  if (!authenticated) return empty;
  const queries = [`repo:${repo} is:pr`, `repo:${repo} is:pr is:merged`];
  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(currentMonth);
  start.setUTCMonth(start.getUTCMonth() - 17);
  const created = new Date(createdAt);
  if (!Number.isNaN(created.getTime()) && created > start && created <= now) start.setTime(Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), 1));
  const monthlyPullRequestsOpened = [];
  for (const month = new Date(start); month <= currentMonth; month.setUTCMonth(month.getUTCMonth() + 1)) {
    const next = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
    const lastDay = new Date(Math.min(next.getTime() - 86_400_000, now.getTime()));
    // One inclusive range is required: repeating created qualifiers can broaden GitHub Search results.
    queries.push(`repo:${repo} is:pr created:${month.toISOString().slice(0, 10)}..${lastDay.toISOString().slice(0, 10)}`);
    monthlyPullRequestsOpened.push({ month: month.toISOString().slice(0, 7), value: null, partial: month.getTime() === currentMonth.getTime() });
  }
  const { counts, error } = await client.searchCounts(queries);
  const countAt = index => Number.isSafeInteger(counts?.[index]) && counts[index] >= 0 ? counts[index] : null;
  monthlyPullRequestsOpened.forEach((point, index) => { point.value = countAt(index + 2); });
  return {
    pullRequestsOpened: countAt(0), pullRequestsMerged: countAt(1), monthlyPullRequestsOpened,
    coverage: "GitHub Search counts in one GraphQL request, up to 18 calendar months. The current UTC month is partial. Missing or failed counts are unavailable, never zero. Search indexing may lag." + (error ? " " + error : ""),
  };
}

/** Deployment-owned historical data; never inferred from stars or container versions. */
export function loadAdoptionSnapshots(path) {
  if (!path) return [];
  const contents = readFileSync(path, "utf8");
  if (contents.length > 1_000_000) throw new Error("Adoption snapshot file exceeds 1 MB");
  const snapshots = JSON.parse(contents);
  if (!Array.isArray(snapshots) || snapshots.length > 100) throw new Error("Adoption snapshots must be an array of at most 100 records");
  for (const snapshot of snapshots) {
    if (typeof snapshot.repo !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(snapshot.repo) || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.asOf || "") || Number.isNaN(Date.parse(snapshot.asOf)) || new Date(snapshot.asOf).toISOString().slice(0, 10) !== snapshot.asOf) throw new Error("Adoption snapshot requires a repository and valid asOf date");
    if (typeof snapshot.source !== "string" || !snapshot.source.trim() || snapshot.source.length > 300) throw new Error("Adoption snapshot requires a source label");
    const metrics = snapshot.metrics;
    if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) throw new Error("Adoption snapshot requires metrics");
    for (const key of ["stars", "forks", "contributorIdentities", "pullRequestsOpened", "pullRequestsMerged", "packageDownloads", "legacyPackageDownloads", "currentPackageDownloads"]) {
      if (metrics[key] !== undefined && (!Number.isSafeInteger(metrics[key]) || metrics[key] < 0)) throw new Error(`Invalid adoption snapshot metric: ${key}`);
    }
    if (["packageDownloads", "legacyPackageDownloads", "currentPackageDownloads"].every(key => metrics[key] !== undefined) && metrics.packageDownloads !== metrics.legacyPackageDownloads + metrics.currentPackageDownloads) throw new Error("Package download total must equal the legacy and current counts");
    if (!Array.isArray(snapshot.caveats) || snapshot.caveats.some(value => typeof value !== "string" || value.length > 500)) throw new Error("Adoption snapshot caveats must be text");
  }
  return snapshots;
}

export function adoptionSnapshotForRepo(snapshots, repo) {
  return snapshots.filter(snapshot => snapshot.repo.toLowerCase() === repo.toLowerCase()).sort((a, b) => b.asOf.localeCompare(a.asOf))[0] || null;
}
