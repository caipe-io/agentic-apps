/** Self-contained so the server and embedded client render the same evidence. */
export function renderArtifactDownloadTrend(data) {
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const count = value => Number.isSafeInteger(value) && value >= 0 ? new Intl.NumberFormat().format(value) : "Unavailable";
  const sourceLink = (url, label) => {
    try {
      const target = new URL(url);
      if (target.origin === "https://github.com" && !target.username && !target.password) return '<a href="' + escape(target.href) + '" target="_blank" rel="noreferrer">' + escape(label) + ' ↗</a>';
    } catch { /* A missing source URL must not become a link. */ }
    return escape(label);
  };
  const chart = (points, title) => {
    const maximum = Math.max(1, ...points.map(point => Number.isSafeInteger(point.value) ? point.value : 0));
    const width = 720;
    const step = width / Math.max(1, points.length);
    return '<svg class="download-chart" viewBox="0 0 720 150" role="img" aria-label="' + escape(title) + '">' + points.map((point, index) => {
      const height = Number.isSafeInteger(point.value) ? Math.max(0, point.value / maximum * 132) : 0;
      const barWidth = Math.min(44, Math.max(1, step - 4));
      const label = point.label + ': ' + (point.complete === false && Number.isSafeInteger(point.value) ? 'At least ' : '') + count(point.value) + (point.partial ? ' (partial day)' : '');
      return '<rect class="download-bar' + (point.partial || point.complete === false ? ' incomplete' : '') + '" x="' + (index * step + (step - barWidth) / 2) + '" y="' + (140 - height) + '" width="' + barWidth + '" height="' + height + '"><title>' + escape(label) + '</title></rect>';
    }).join('') + '</svg>';
  };
  const empty = text => '<div class="empty-state"><p>' + escape(text) + '</p></div>';
  if (!data) return '<div class="chart-head"><h3>Artifact downloads</h3><span>Container pulls and release assets</span></div>' + empty('This saved report has no artifact-download evidence. Generate a new report card to include available download data.');
  const ghcr = data.ghcr || {};
  const points = Array.isArray(ghcr.points) ? ghcr.points : [];
  const packages = Array.isArray(ghcr.packages) ? ghcr.packages : [];
  const known = points.reduce((sum, point) => sum + (Number.isSafeInteger(point.value) ? point.value : 0), 0);
  const bounded = ghcr.status !== "available" || points.some(point => point.complete === false);
  const dailyRows = points.map(point => '<tr><th scope="row">' + escape(point.date) + (point.partial ? ' · partial day' : '') + '</th><td>' + (point.complete === false && Number.isSafeInteger(point.value) ? 'At least ' : '') + count(point.value) + '</td></tr>').join('');
  const sourceRows = packages.map(item => '<tr><th scope="row">' + sourceLink(item.sourceUrl, item.name) + '</th><td>' + count(item.windowDownloads) + '</td></tr>').join('');
  let containers = '<section aria-label="Container download history"><div class="chart-head"><h4>Container pulls per day</h4><span>Recent GitHub-reported days</span></div>';
  if (points.length) {
    containers += '<p class="download-total">' + (bounded ? 'At least ' : '') + count(known) + '<span> pulls in the reported window</span></p>' +
      '<p class="coverage">' + count(ghcr.availablePackages) + ' of ' + count(ghcr.discoveredPackages) + ' discovered public artifacts available' + (ghcr.truncated ? ' · discovery limited' : '') + '</p>' +
      chart(points.map(point => ({ ...point, label: point.date })), 'Daily GHCR container pulls; exact counts are in the data table') +
      '<div class="axis-labels"><span>' + escape(points[0].date) + '</span><span>' + escape(points.at(-1).date) + (points.at(-1).partial ? ' · partial' : '') + '</span></div>' +
      '<details class="download-details"><summary>Daily counts and artifact sources</summary><div class="download-table"><table class="snapshot-table"><caption>Daily container pulls</caption><tbody>' + dailyRows + '</tbody></table><table class="snapshot-table"><caption>Artifact pulls in the reported window</caption><tbody>' + sourceRows + '</tbody></table></div></details>';
  } else containers += empty('Container download history is unavailable. No public GHCR chart could be read for this repository.');
  containers += '<p class="coverage">' + escape(ghcr.coverage || 'Public GHCR history was not included in this report.') + '</p>' + (ghcr.fetchedAt ? '<p class="coverage">Fetched ' + escape(ghcr.fetchedAt) + '</p>' : '') + '</section>';
  const releaseData = data.releases || {};
  const releases = (releaseData.releases || []).filter(item => item.assetCount > 0);
  let assets = '<section aria-label="Release asset download counts"><div class="chart-head"><h4>Release-asset downloads</h4><span>Lifetime counts by release</span></div>';
  if (releaseData.status === 'unavailable' || !releaseData.status) assets += empty('Release-asset download counts are unavailable.');
  else if (!releases.length) assets += empty('No published release assets with download counters were found. GitHub-generated source archives are not counted.');
  else {
    const latest = releases.slice(0, 12).reverse();
    assets += '<p class="download-total">' + (!releaseData.complete && Number.isSafeInteger(releaseData.totalDownloads) ? 'At least ' : '') + count(releaseData.totalDownloads) + '<span> downloads across ' + count(releaseData.assetCount) + ' release asset' + (releaseData.assetCount === 1 ? '' : 's') + '</span></p>' +
      chart(latest.map(item => ({ ...item, label: item.release })), 'Lifetime asset downloads for the latest releases with assets; not a daily download trend') +
      '<div class="axis-labels"' + (latest.length === 1 ? ' style="justify-content:center"' : '') + '><span>' + escape(latest[0].release) + '</span>' + (latest.length > 1 ? '<span>' + escape(latest.at(-1).release) + '</span>' : '') + '</div>' +
      '<details class="download-details"><summary>All release counts and sources</summary><div class="download-table"><table class="snapshot-table"><caption>Lifetime asset downloads by release</caption><tbody>' + releases.map(item => '<tr><th scope="row">' + sourceLink(item.sourceUrl, item.release) + '</th><td>' + count(item.value) + '</td></tr>').join('') + '</tbody></table></div></details>';
  }
  assets += '<p class="coverage">' + escape(releaseData.coverage || 'Release-asset counts were not included in this report.') + '</p>' + (releaseData.fetchedAt ? '<p class="coverage">Fetched ' + escape(releaseData.fetchedAt) + '</p>' : '') + '</section>';
  return '<div class="chart-head"><h3>Artifact downloads</h3><span>Source coverage shown separately</span></div><div class="download-panels">' + containers + assets + '</div>';
}

export function artifactDownloadsMarkdown(data) {
  const safe = value => String(value ?? "Unavailable").replace(/[|\r\n]/g, " ");
  const number = value => Number.isSafeInteger(value) && value >= 0 ? String(value) : "Unavailable";
  if (!data) return ['## Artifact downloads', '', 'Not included in this saved report. Generate a new report to include download evidence.', ''];
  const ghcr = data.ghcr || {};
  const releases = data.releases || {};
  return ['## Artifact downloads', '', '### Daily GHCR container pulls', '', '| Reported date | Downloads |', '| :-- | --: |',
    ...(ghcr.points || []).map(point => '| ' + safe(point.date) + (point.partial ? ' (partial day)' : '') + ' | ' + (point.complete === false && Number.isSafeInteger(point.value) ? 'At least ' : '') + number(point.value) + ' |'), '', safe(ghcr.coverage), '', 'Observed: ' + safe(ghcr.fetchedAt), '',
    'Sources: ' + (ghcr.packages || []).map(item => safe(item.sourceUrl)).join(', '), '',
    '### Lifetime release-asset downloads by release', '', '| Release | Downloads | Assets |', '| :-- | --: | --: |',
    ...(releases.releases || []).filter(item => item.assetCount > 0).map(item => '| ' + safe(item.release) + ' | ' + number(item.value) + ' | ' + number(item.assetCount) + ' |'), '', safe(releases.coverage), '', 'Observed: ' + safe(releases.fetchedAt), '',
    ...(releases.releases || []).filter(item => item.assetCount > 0).map(item => 'Source: ' + safe(item.sourceUrl)), ''];
}
