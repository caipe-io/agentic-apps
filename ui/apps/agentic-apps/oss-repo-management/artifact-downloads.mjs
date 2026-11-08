const ORIGIN = "https://github.com";
const MAX_BYTES = 600_000;
const MAX_PACKAGES = 60;

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

/** Only public GitHub HTML is fetched; repository credentials never leave the API client. */
async function publicHtml(url, fetchImpl, signal) {
  for (let redirect = 0; redirect < 4; redirect++) {
    const target = new URL(url);
    if (target.origin !== ORIGIN || target.username || target.password) throw new Error("Unexpected package source redirect");
    const response = await fetchImpl(target.href, {
      redirect: "manual", headers: { accept: "text/html", "user-agent": "oss-report-card" }, signal,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Missing package source redirect");
      await response.body?.cancel();
      url = new URL(location, target).href;
      continue;
    }
    if (!response.ok) throw new Error(`Package source returned HTTP ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Package source returned no body");
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) throw new Error("Package source exceeds size limit");
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    return { html: Buffer.concat(chunks).toString("utf8"), url: target.href };
  }
  throw new Error("Too many package source redirects");
}

export function packageLinks(html, owner) {
  const links = [...html.matchAll(/href="(\/(?:orgs|users)\/([^/"?]+)\/packages\/container\/package\/([^"?#]+))"/g)]
    .filter(match => match[2].toLowerCase() === owner.toLowerCase());
  return [...new Set(links.map(match => match[1]))];
}

/** GitHub's rendered 30-day chart is undocumented. Reject changed/incomplete markup. */
export function parsePackageDownloads(html, today) {
  const section = html.match(/aria-label="Downloads for the last 30 days"[^>]*>([\s\S]*?)<\/svg>/i)?.[1];
  if (!section) throw new Error("Daily package chart unavailable");
  const points = [];
  for (const rect of section.matchAll(/<rect\b([^>]*)>/gi)) {
    const date = rect[1].match(/\bdata-date="([^"]+)"/)?.[1];
    const count = rect[1].match(/\bdata-merge-count="([0-9]+)"/)?.[1];
    if (!validDate(date) || count === undefined || !Number.isSafeInteger(Number(count))) throw new Error("Invalid daily package count");
    if (date > today || points.some(point => point.date === date)) throw new Error("Invalid daily package date");
    points.push({ date, value: Number(count), partial: date === today });
  }
  if (!points.length || points.length > 31) throw new Error("Daily package chart unavailable");
  points.sort((a, b) => a.date.localeCompare(b.date));
  if (Date.parse(points.at(-1).date) - Date.parse(points[0].date) > 31 * 86_400_000) throw new Error("Invalid package chart window");
  const total = html.match(/Total downloads<\/span>\s*<h3\b[^>]*title="([0-9]+)"/i)?.[1];
  return { points, allTimeDownloads: total !== undefined && Number.isSafeInteger(Number(total)) ? Number(total) : null };
}

export function aggregatePackageDownloads(packages, truncated = false) {
  const available = packages.filter(item => item.status === "available");
  const observed = [...new Set(available.flatMap(item => item.points.map(point => point.date)))].sort();
  const days = [];
  if (observed.length) for (let time = Date.parse(observed[0]); time <= Date.parse(observed.at(-1)) && days.length < 32; time += 86_400_000) days.push(new Date(time).toISOString().slice(0, 10));
  const points = days.map(date => {
    const known = available.flatMap(item => item.points.filter(point => point.date === date));
    const value = known.reduce((sum, point) => sum + point.value, 0);
    return { date, value: known.length && Number.isSafeInteger(value) ? value : null,
      complete: !truncated && known.length === packages.length, partial: known.some(point => point.partial) };
  });
  return { points, availablePackages: available.length, discoveredPackages: packages.length, truncated };
}

export async function fetchGhcrDownloads({ repo, now = new Date(), fetchImpl = fetch, ownerType = "Organization" }) {
  const [owner, name, extra] = repo.split("/");
  if (extra || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(owner || "") || !/^[A-Za-z0-9_.-]+$/.test(name || "") || [".", ".."].includes(name)) throw new Error("Invalid package repository");
  const fetchedAt = now.toISOString();
  const today = fetchedAt.slice(0, 10);
  const signal = AbortSignal.timeout(15_000);
  const packages = [];
  let truncated = false;
  let discoveryComplete = false;
  try {
    for (let page = 1; page <= 2; page++) {
      const path = ownerType === "User" ? `/${owner}?tab=packages&repo_name=${encodeURIComponent(name)}&page=${page}`
        : `/orgs/${owner}/packages?repo_name=${encodeURIComponent(name)}&page=${page}`;
      const { html } = await publicHtml(ORIGIN + path, fetchImpl, signal);
      for (const path of packageLinks(html, owner)) if (!packages.some(item => item.path === path)) packages.push({ path, name: decodeURIComponent(path.split("/package/")[1]), status: "unavailable" });
      // A next-page link is evidence that discovery is incomplete, not an empty result.
      const hasNext = new RegExp(`(?:[?&]|&amp;)page=${page + 1}(?:[&"#]|&amp;)`).test(html);
      if (!hasNext) { discoveryComplete = true; break; }
      if (page === 2) truncated = true;
    }
    truncated ||= packages.length > MAX_PACKAGES;
    packages.splice(MAX_PACKAGES);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(8, packages.length) }, async () => {
      while (next < packages.length) {
        const item = packages[next++];
        try {
          const source = await publicHtml(ORIGIN + item.path, fetchImpl, signal);
          if (!new URL(source.url).pathname.toLowerCase().startsWith("/" + repo.toLowerCase() + "/pkgs/container/")) throw new Error("Package repository association unavailable");
          Object.assign(item, parsePackageDownloads(source.html, today), { status: "available", sourceUrl: source.url });
        } catch (error) {
          item.reason = "Public package download counts unavailable";
          console.warn("Package download source unavailable", repo, item.name, error.message);
        }
      }
    }));
  } catch (error) {
    truncated = true;
    console.warn("Package discovery unavailable", repo, error.message);
  }
  const summary = aggregatePackageDownloads(packages, truncated || !discoveryComplete);
  const sources = packages.map(({ points, path, ...item }) => {
    const sum = points?.reduce((total, point) => total + point.value, 0);
    return { ...item, sourceUrl: item.sourceUrl || ORIGIN + path, windowDownloads: Number.isSafeInteger(sum) ? sum : null };
  });
  return { ...summary, packages: sources, fetchedAt, status: summary.availablePackages ? (truncated || summary.availablePackages !== packages.length ? "partial" : "available") : "unavailable",
    coverage: "Daily pulls from public GHCR packages linked to this repository, across versions and platforms. Includes automation and repeated pulls, not unique users or installations. Today's count is partial. Missing packages/days make totals lower bounds." };
}

/** Release asset counters are lifetime totals by release, never historical daily downloads. */
export async function fetchReleaseAssetDownloads({ client, repo, now = new Date() }) {
  const releases = [];
  const seen = new Set();
  let complete = false;
  let failed = false;
  for (let page = 1; page <= 3; page++) {
    const result = await client.tryGet(`/repos/${repo.split("/").map(encodeURIComponent).join("/")}/releases?per_page=100&page=${page}`);
    if (result.status !== "available" || !Array.isArray(result.data)) { failed = true; break; }
    for (const release of result.data) {
      if (release.draft) continue;
      if (!Array.isArray(release.assets)) { failed = true; continue; }
      const assets = release.assets.filter(asset => !seen.has(asset.id));
      for (const asset of assets) seen.add(asset.id);
      const valid = assets.every(asset => Number.isSafeInteger(asset.id) && asset.id > 0 && Number.isSafeInteger(asset.download_count) && asset.download_count >= 0);
      failed ||= !valid;
      const count = assets.reduce((sum, asset) => sum + (asset.download_count || 0), 0);
      releases.push({ release: release.tag_name, publishedAt: release.published_at, assetCount: assets.length,
        value: valid && Number.isSafeInteger(count) ? count : null, sourceUrl: release.html_url });
    }
    if (result.data.length < 100) { complete = true; break; }
  }
  const total = releases.reduce((sum, release) => sum + (release.value || 0), 0);
  const validTotal = Number.isSafeInteger(total) && releases.every(release => release.value !== null);
  return { releases, fetchedAt: now.toISOString(), status: failed ? (releases.length ? "partial" : "unavailable") : complete ? "available" : "partial",
    totalDownloads: validTotal && (releases.length || complete) ? total : null, assetCount: releases.reduce((sum, release) => sum + release.assetCount, 0), complete: complete && !failed && validTotal,
    coverage: "Lifetime download counters for published release assets, including prereleases; up to 300 releases. Counts grouped by release are not downloads during its publication month. GitHub-generated source archives have no download counters. Daily release-download history is unavailable." };
}

/** Coalesce public lookups and bound cache growth independently of report refreshes. */
export function createGhcrDownloadReader({ fetchImpl = fetch, ttlMs = 900_000 } = {}) {
  const cache = new Map();
  return async (repo, ownerType = "Organization") => {
    const key = repo.toLowerCase();
    const saved = cache.get(key);
    if (saved && saved.expiresAt > Date.now()) return saved.pending;
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    const entry = { expiresAt: Date.now() + ttlMs };
    entry.pending = fetchGhcrDownloads({ repo, ownerType, fetchImpl }).then(result => {
      entry.expiresAt = Date.now() + (result.status === "unavailable" ? Math.min(ttlMs, 60_000) : ttlMs);
      return result;
    }).catch(error => { if (cache.get(key) === entry) cache.delete(key); throw error; });
    cache.set(key, entry);
    return entry.pending;
  };
}
