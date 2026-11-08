import assert from "node:assert/strict";
import test from "node:test";
import { aggregatePackageDownloads, createGhcrDownloadReader, fetchGhcrDownloads, fetchReleaseAssetDownloads, packageLinks, parsePackageDownloads } from "./artifact-downloads.mjs";
import { artifactDownloadsMarkdown, renderArtifactDownloadTrend } from "./artifact-download-view.mjs";
import { buildOssRepoMarkdownReport } from "./markdown-report.mjs";

const html = (points = [["2026-08-01", 0], ["2026-08-02", 20]]) => '<span>Total downloads</span><h3 title="12345">12K</h3><div aria-label="Downloads for the last 30 days"><svg>' + points.map(([date, count]) => `<rect data-date="${date}" data-merge-count="${count}"></rect>`).join("") + '</svg></div>';
const link = name => `<a href="/orgs/example/packages/container/package/${name}">Package</a>`;
const now = new Date("2026-08-02T12:00:00Z");

test("uses exact daily and all-time counts, retaining real zeros and marking the current day partial", () => {
  const result = parsePackageDownloads(html(), "2026-08-02");
  assert.equal(result.allTimeDownloads, 12345);
  assert.deepEqual(result.points, [{ date: "2026-08-01", value: 0, partial: false }, { date: "2026-08-02", value: 20, partial: true }]);
  for (const invalid of ['<html>Sign in</html>', html([["2026-02-30", 1]]), html([["2026-08-03", 1]]), html([["2026-08-01", -1]]), html([["2026-08-01", 1], ["2026-08-01", 2]]), html([["2026-08-01", "9007199254740992"]])]) assert.throws(() => parsePackageDownloads(invalid, "2026-08-02"));
});

test("discovers only same-owner container packages and deduplicates list links", () => {
  assert.deepEqual(packageLinks(link("app") + link("app") + link("charts%2Fapp") + '<a href="/orgs/other/packages/container/package/app">Other</a>', "example"), ['/orgs/example/packages/container/package/app', '/orgs/example/packages/container/package/charts%2Fapp']);
});

test("missing packages and calendar days remain lower bounds or unavailable, never invented zeros", () => {
  const packages = [{ status: "available", points: [{ date: "2026-08-01", value: 0 }, { date: "2026-08-03", value: 5 }] }, { status: "unavailable" }];
  assert.deepEqual(aggregatePackageDownloads(packages).points, [
    { date: "2026-08-01", value: 0, complete: false, partial: false },
    { date: "2026-08-02", value: null, complete: false, partial: false },
    { date: "2026-08-03", value: 5, complete: false, partial: false },
  ]);
  assert.equal(aggregatePackageDownloads([packages[0]], true).points[0].complete, false);
});

test("reads public GHCR pages without credentials and continues when one package fails", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url.includes('?repo_name=')) return new Response(link("app") + link("missing"));
    if (url.endsWith('/missing')) return new Response('Rate limited', { status: 429 });
    return new Response(html());
  };
  const result = await fetchGhcrDownloads({ repo: "example/project", now, fetchImpl });
  assert.equal(result.status, 'partial');
  assert.equal(result.availablePackages, 1);
  assert.equal(result.discoveredPackages, 2);
  assert.equal(result.points[0].complete, false);
  assert.equal(result.packages[0].windowDownloads, 20);
  assert.ok(requests.every(({ options }) => !options.headers.authorization && !options.headers.cookie && options.redirect === 'manual'));
});

test("rejects off-GitHub redirects without fetching the destination", async () => {
  const requests = [];
  const result = await fetchGhcrDownloads({ repo: "example/project", now, fetchImpl: async url => {
    requests.push(url);
    return new Response(null, { status: 302, headers: { location: 'https://example.test/private' } });
  } });
  assert.equal(result.status, 'unavailable');
  assert.equal(requests.length, 1);
});

test("a source body limit fails closed", async () => {
  const result = await fetchGhcrDownloads({ repo: "example/project", now, fetchImpl: async () => new Response('x'.repeat(600_001)) });
  assert.equal(result.status, 'unavailable');
});

test("bounded discovery is marked partial even if all discovered package pages succeed", async () => {
  const result = await fetchGhcrDownloads({ repo: "example/project", now, fetchImpl: async url => {
    if (url.includes('?repo_name=')) return new Response(link("app") + '<a href="?page=' + (url.endsWith('page=1') ? '2' : '3') + '&amp;repo_name=project">Next</a>');
    return new Response(html());
  } });
  assert.equal(result.truncated, true);
  assert.equal(result.status, 'partial');
  assert.ok(result.points.every(point => !point.complete));
});

test("coalesces concurrent report refreshes and caches the public source", async () => {
  let requests = 0;
  const reader = createGhcrDownloadReader({ fetchImpl: async url => { requests++; return new Response(url.includes('?repo_name=') ? link('app') : html()); } });
  await Promise.all([reader('example/project'), reader('EXAMPLE/PROJECT')]);
  await reader('example/project');
  assert.equal(requests, 2);
});

test("release assets use lifetime download counters, exclude drafts and deduplicate assets", async () => {
  const client = { tryGet: async () => ({ status: 'available', data: [
    { tag_name: 'v2', published_at: '2026-08-01', html_url: 'https://github.com/example/project/releases/tag/v2', assets: [{ id: 1, download_count: 8 }, { id: 2, download_count: 0 }] },
    { tag_name: 'v1', published_at: '2026-07-01', assets: [{ id: 1, download_count: 8 }, { id: 3, download_count: 12 }] },
    { draft: true, assets: [{ id: 4, download_count: 1000 }] },
  ] }) };
  const result = await fetchReleaseAssetDownloads({ client, repo: 'example/project', now });
  assert.equal(result.totalDownloads, 20);
  assert.equal(result.assetCount, 3);
  assert.equal(result.complete, true);
  assert.match(result.coverage, /not downloads during/);
  assert.match(result.coverage, /source archives have no download counters/);
});

test("empty releases differ from an unavailable release API", async () => {
  const empty = await fetchReleaseAssetDownloads({ client: { tryGet: async () => ({ status: 'available', data: [] }) }, repo: 'example/project', now });
  const failed = await fetchReleaseAssetDownloads({ client: { tryGet: async () => ({ status: 'unavailable' }) }, repo: 'example/project', now });
  assert.equal(empty.totalDownloads, 0);
  assert.equal(empty.complete, true);
  assert.equal(failed.totalDownloads, null);
  assert.equal(failed.status, 'unavailable');
  assert.match(renderArtifactDownloadTrend({ releases: empty }), /No published release assets/);
  assert.match(renderArtifactDownloadTrend({ releases: failed }), /counts are unavailable/);
});

test("malformed release counters are not converted to zero", async () => {
  const result = await fetchReleaseAssetDownloads({ client: { tryGet: async () => ({ status: 'available', data: [{ tag_name: 'v1', assets: [{ id: 1, download_count: -1 }] }] }) }, repo: 'example/project', now });
  assert.equal(result.totalDownloads, null);
  assert.equal(result.complete, false);
  assert.equal(result.status, 'partial');
});

test("release pagination is bounded and partial pages retain only observed counters", async () => {
  let requests = 0;
  const page = Array.from({ length: 100 }, (_, index) => ({ tag_name: 'v' + index, assets: index ? [] : [{ id: 1, download_count: 5 }] }));
  const truncated = await fetchReleaseAssetDownloads({ client: { tryGet: async () => { requests++; return { status: 'available', data: page }; } }, repo: 'example/project', now });
  assert.equal(requests, 3);
  assert.equal(truncated.complete, false);
  assert.equal(truncated.status, 'partial');
  requests = 0;
  const failed = await fetchReleaseAssetDownloads({ client: { tryGet: async () => ++requests === 1 ? { status: 'available', data: page } : { status: 'unavailable' } }, repo: 'example/project', now });
  assert.equal(failed.totalDownloads, 5);
  assert.equal(failed.complete, false);
  assert.equal(failed.status, 'partial');
});

test("supports public container packages owned by a personal repository", async () => {
  const result = await fetchGhcrDownloads({ repo: 'example/project', ownerType: 'User', now, fetchImpl: async url => new Response(url.includes('repo_name=') ? '<a href="/users/example/packages/container/package/app">Package</a>' : html()) });
  assert.equal(result.status, 'available');
  assert.equal(result.availablePackages, 1);
});

test("view and export preserve source limits and old saved reports remain readable", () => {
  const data = { ghcr: { status: 'partial', availablePackages: 1, discoveredPackages: 2, points: [{ date: '2026-08-02', value: 20, complete: false, partial: true }], packages: [{ name: '<script>bad</script>', sourceUrl: 'javascript:alert(1)' }] }, releases: { status: 'available', releases: [] } };
  const view = renderArtifactDownloadTrend(data);
  assert.match(view, /At least 20/);
  assert.match(view, /partial day/);
  assert.doesNotMatch(view, /<script>|href="javascript:/);
  assert.match(artifactDownloadsMarkdown(data).join('\n'), /At least 20/);
  assert.match(renderArtifactDownloadTrend(), /saved report has no artifact-download evidence/);
});

test("browser-export serialization includes the artifact Markdown helper", () => {
  const render = new Function(artifactDownloadsMarkdown.toString() + "\n" + buildOssRepoMarkdownReport.toString() + "\nreturn buildOssRepoMarkdownReport;")();
  const markdown = render({ repo: "example/project", artifactDownloads: { ghcr: { points: [{ date: "2026-08-02", value: 10, complete: true }], fetchedAt: "2026-08-02T12:00:00Z" }, releases: { releases: [] } } });
  assert.match(markdown, /Daily GHCR container pulls/);
  assert.match(markdown, /2026-08-02 \| 10/);
  assert.match(markdown, /Observed: 2026-08-02T12:00:00Z/);
});
