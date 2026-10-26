import { buildEc2AnomalySignals, validateEc2AnomalyResponse } from "./anomalies.mjs";
import { renderDonutSvg } from "../../_lib/donut-svg.mjs";
import { ec2CpuCategory } from "./overview.mjs";
import { renderAgenticAppConversationClient } from "../../_lib/conversation-client.mjs";
import { renderMicrofrontendClient } from "../../_lib/microfrontend-client.mjs";
import { normalizeEc2Search, validateEc2Response } from "./inventory.mjs";
import { createQueryNavigation as createEc2Navigation } from "../../_lib/query-navigation.mjs";
import { validateEc2StopResponse } from "./stop.mjs";

export function renderEc2Dashboard({ basePath, appPath, compact, configuration }) {
  const config = JSON.stringify({ basePath, appPath, configuration }).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EC2 Instances Dashboard</title><style>
  :root{color-scheme:dark;--bg:#080e1a;--surface:#101a2b;--text:#e2e8f0;--muted:#a2b3cc;--line:#293951;--track:#22314a;--accent:#67e8f9;--warning:#fcd34d;--error:#fecaca;font:calc(15px * var(--app-font-scale,1))/1.5 Inter,ui-sans-serif,system-ui,sans-serif;color:var(--text);background:var(--bg)}
  :root[data-caipe-theme=light]{color-scheme:light;--bg:#f7f9fc;--surface:#fff;--text:#15233a;--muted:#50627b;--line:#dce3ed;--track:#e3eaf1;--accent:#087a83;--warning:#925705;--error:#a82323}
  html{overscroll-behavior-y:contain}*{box-sizing:border-box}body{margin:0}main{max-width:1440px;margin:auto;padding:28px 24px 44px}h1,h2,h3,p{margin:0}h1{font-size:1.85rem;letter-spacing:-.03em}h2{font-size:1.12rem}h3{font-size:1rem}.muted,small{color:var(--muted)}.small,small{font-size:.82rem}.subtitle{margin:6px 0 22px;color:var(--muted)}.row{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}.actions,.controls{display:flex;align-items:end;gap:12px;flex-wrap:wrap}.controls{margin:18px 0 14px}label{display:grid;gap:5px;color:var(--muted);font-size:.82rem}input,select,button{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:10px 12px}button{cursor:pointer;font-size:.88rem}button:disabled{opacity:.5;cursor:default}button.primary{background:var(--accent);color:var(--bg);border-color:var(--accent);font-weight:600}:focus-visible{outline:2px solid var(--accent);outline-offset:3px}a{color:var(--accent)}input[type=search]{width:100%;min-width:240px}select{min-width:160px}.grow{flex:1}.panel{border:1px solid var(--line);background:var(--surface);border-radius:12px;padding:20px;margin:18px 0}.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:18px}.kpi{margin:0}.kpi strong{display:block;font-size:1.9rem;font-variant-numeric:tabular-nums;margin:5px 0}.bars{display:grid;gap:12px;margin-top:18px}.bar-row{display:grid;grid-template-columns:minmax(100px,1fr) 2fr 40px;gap:12px;align-items:center;font-size:.85rem}.bar-track{height:10px;background:var(--track);border-radius:4px;overflow:hidden}.bar-track i{display:block;height:100%;background:var(--accent)}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:.85rem}th{text-align:left;color:var(--muted);font-size:.78rem;font-weight:500}td,th{padding:14px 10px;border-bottom:1px solid var(--line);vertical-align:top}table.inventory{min-width:1150px}.numeric{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.tag{display:inline-block;border:1px solid var(--line);border-radius:5px;padding:2px 6px;font-size:.75rem;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.state{display:inline-block;border:1px solid var(--line);border-radius:20px;padding:2px 8px;font-size:.78rem}.state.running{color:var(--accent)}.tag-stack{display:grid;gap:4px}.notice{margin:12px 0;color:var(--muted)}.error{color:var(--error)}.warning{color:var(--warning)}.empty{text-align:center;padding:35px;color:var(--muted)}.progress{border-color:var(--accent);background:var(--track)}.spinner{width:21px;height:21px;border:3px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;display:inline-block;flex-shrink:0}.progress-heading{justify-content:flex-start}.progress-heading strong{flex:1}.progress p{margin-top:8px}.progress.finished{padding:10px 16px;margin:10px 0}.progress.finished .progress-heading strong{font-size:.88rem}.progress.finished p{font-size:.78rem;margin-top:2px}.coverage-panel{padding:10px 16px!important;margin:12px 0}.coverage-panel details{margin:0}.detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:18px}.detail-grid strong{display:block;margin-top:4px}dl{display:grid;grid-template-columns:minmax(120px,1fr) 3fr;gap:10px 18px}dt,dd{margin:0;overflow-wrap:anywhere}details{margin-top:14px}summary{cursor:pointer;color:var(--muted)}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.8rem}.pagination{margin-top:16px}.scope-issues{display:grid;gap:8px;padding-left:20px}.selected-row{background:var(--track)}[hidden]{display:none!important}body.compact main{padding-top:18px}body.compact .panel{padding:16px}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.spinner{animation:none}}@media(max-width:850px){.kpis,.detail-grid{grid-template-columns:1fr 1fr}}@media(max-width:520px){main{padding:18px 12px}.kpis{grid-template-columns:1fr 1fr}.controls label{width:100%}.controls select{width:100%}.detail-grid{grid-template-columns:1fr}.bar-row{grid-template-columns:90px 1fr 30px}}@media(pointer:coarse){input,select,button{min-height:44px}}
  .signal-row{margin-top:14px}.signal-heading{align-items:start}.signal-heading h3{overflow-wrap:anywhere}.rule-label{display:inline-block;padding:3px 8px;border:1px solid var(--line);border-radius:20px;color:var(--warning);font-size:.77rem;margin:4px 6px 4px 0}.signal-row ul{margin:10px 0;padding-left:22px}.signal-actions{margin-top:14px}.cpu-summary{margin-top:10px;font-variant-numeric:tabular-nums}.analysis-finding{border-top:1px solid var(--line);padding-top:16px;margin-top:16px}.anomaly-stats{display:flex;flex-wrap:wrap;gap:8px 20px;margin:12px 0}.anomaly-stats strong{color:var(--text)}
  .cost-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.cost-grid>.panel{margin:0}.cost-bars .bar-row{grid-template-columns:minmax(100px,1fr) 1.5fr minmax(110px,auto)}@media(max-width:700px){.cost-grid{grid-template-columns:1fr}}
  .tabs{position:sticky;top:0;z-index:10;background:var(--bg);display:flex;gap:4px;overflow-x:auto;border-bottom:1px solid var(--line);margin:16px 0}[role=tabpanel]{scroll-margin-top:74px}.tabs button{min-width:130px;background:transparent;border:0;border-bottom:3px solid transparent;border-radius:8px 8px 0 0;color:var(--muted)}.tabs button[aria-selected=true]{color:var(--accent);border-bottom-color:var(--accent);background:var(--surface);font-weight:600}.pie-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.pie-grid>.panel{margin:0}.pie-chart{display:block;width:100%;max-width:210px;margin:16px auto}.pie-legend{list-style:none;margin:0;padding:0;display:grid;gap:10px}.pie-legend li{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:8px;align-items:baseline;font-size:.82rem}.pie-legend i{display:block;width:10px;height:10px;border-radius:2px}.pie-legend span{overflow-wrap:anywhere}.filter-panel{padding:8px 16px!important}.filter-panel .controls{margin:8px 0}.filter-panel details{flex-basis:100%;width:100%;min-width:0}.filter-panel label{min-width:150px}.filter-panel input[type=search]{min-width:220px}@media(max-width:1050px){.pie-grid{grid-template-columns:1fr 1fr}.pie-grid>.panel:last-child{grid-column:1/-1}}@media(max-width:600px){.pie-grid{grid-template-columns:1fr}.pie-grid>.panel:last-child{grid-column:auto}}

  .search-landing{max-width:860px;margin:64px auto 32px}.search-landing h2{font-size:1.7rem;margin-bottom:8px}.search-landing form{margin:24px 0 12px}.search-landing input[type=search]{font-size:1.15rem;padding:18px 20px;border-radius:12px}.search-landing input[type=search]:focus{border-color:var(--accent)}.quick-results{list-style:none;padding:0;margin:24px 0;display:grid;gap:10px}.quick-results a{display:block;padding:16px 20px;background:var(--surface);border:1px solid var(--line);border-radius:10px;text-decoration:none;color:var(--text)}.quick-results a:hover{border-color:var(--accent)}.quick-results strong,.quick-results span{display:block}.quick-results span{margin-top:5px;color:var(--muted);font-size:.82rem;overflow-wrap:anywhere}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:600px){.search-landing{margin-top:32px}}
  #detailTitle,.detail-grid strong{overflow-wrap:anywhere}.detail-grid>div{min-width:0}
  .stop-button{border-color:var(--warning);color:var(--warning)}dialog{background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:14px;padding:24px;width:min(560px,calc(100% - 24px));max-height:90vh;overflow:auto}dialog::backdrop{background:rgb(0 0 0 / .65)}dialog input{width:100%}.stop-target{padding:14px;background:var(--bg);border-radius:8px;overflow-wrap:anywhere}.stop-target strong,.stop-target span{display:block;margin:4px 0}
  </style></head><body class="${compact ? "compact" : ""}"><main>
  <header class="row"><div><h1>EC2 instances</h1><p class="subtitle">Explore instance size, OS, tags, and cost by AWS account and region.</p></div><div class="actions" id="headerActions"><button id="copyLink">Copy link</button><button id="refresh" disabled>Refresh live data</button><button id="askAws">Ask AWS</button></div></header>
  <nav class="tabs" role="tablist" aria-label="EC2 dashboard views"><button id="searchTab" role="tab" aria-selected="true" aria-controls="searchPanel" tabindex="0">Search</button><button id="instancesTab" role="tab" aria-selected="false" aria-controls="instancesPanel" tabindex="-1">Instances</button><button id="gpuTab" role="tab" aria-selected="false" aria-controls="instancesPanel" tabindex="-1">GPU instances</button><button id="overviewTab" role="tab" aria-selected="false" aria-controls="overviewPanel" tabindex="-1">Analytics</button><button id="costsTab" role="tab" aria-selected="false" aria-controls="costsPanel" tabindex="-1">Cost overview</button><button id="anomaliesTab" role="tab" aria-selected="false" aria-controls="anomaliesPanel" tabindex="-1">Anomalies</button></nav>
  <section id="searchPanel" role="tabpanel" aria-labelledby="searchTab" class="search-landing">
    <h2>Find an instance</h2><p class="muted">Search by name, instance ID, owner, or tag.</p>
    <form id="quickSearchForm" role="search" autocomplete="off"><label class="sr-only" for="quickSearch">Search instances</label><input id="quickSearch" type="search" maxlength="256" placeholder="Search instances…" autocomplete="off" data-1p-ignore spellcheck="false" aria-describedby="quickSearchStatus"></form>
    <p id="quickSearchStatus" class="small muted" role="status" aria-live="polite">Search across all configured accounts and regions.</p>
    <ul id="quickResults" class="quick-results" aria-label="Matching instances"></ul><button id="allSearchResults" hidden>View all results</button>
  </section>
  <section id="scopePanel" class="panel" aria-labelledby="scopeTitle"><h2 id="scopeTitle">AWS account scope</h2><form id="scopeForm" class="controls"><label class="grow">Account / profile<select id="profile" required></select></label><label class="grow">Region<select id="region" required></select></label><label>Search in<select id="searchIn" aria-describedby="searchHelp"><option value="all">All fields</option><option value="name">Name or instance ID</option><option value="tags">Tags</option></select></label><label class="grow">Find an instance<input aria-describedby="searchHelp" id="search" type="search" maxlength="256" placeholder="Name, instance ID, tag, or key=value" autocomplete="off" data-1p-ignore spellcheck="false"></label><button class="primary" id="load" type="submit">Reload cached view</button><button id="searchAll" type="button">Search all accounts &amp; regions</button></form><p id="searchHelp" class="muted small">Search names and all tags, including tags outside the table preview. Use a tag key, value, or key=value, such as Owner=example-team. Case, spaces, hyphens, and underscores match consistently.</p><p class="muted small">All configured accounts and regions load automatically from the shared cache. The background refresh runs every ${configuration.cacheTtlMs / 3_600_000} hours. Refresh live data bypasses the cache. Inventory reads are read-only. Instance stop is a separate, permission-gated action.</p></section>

  <section id="progress" class="panel progress" hidden><div class="row progress-heading"><span id="spinner" class="spinner" aria-hidden="true"></span><strong id="progressTitle" role="status" aria-live="polite"></strong><time id="elapsed" class="small muted"></time><button id="cancel">Cancel</button></div><p id="progressDetail" class="small muted"></p></section>
  <p id="cacheStatus" class="notice small" role="status" aria-live="polite">Checking background cache status…</p>
  <p id="status" class="notice small" role="status" aria-live="polite">Loading cached inventory from all configured accounts and regions…</p>
  <div id="content" hidden>
    <div id="fleetSummary"><div class="kpis"><article class="panel kpi"><span class="muted small">Matching instances</span><strong id="instanceCount">—</strong><small id="coverageCount"></small></article><article class="panel kpi"><span class="muted small">Running / stopped</span><strong id="stateCount">—</strong><small>In the current filters</small></article><article class="panel kpi"><span class="muted small">On-demand equivalent / mo</span><strong id="monthlyCost">—</strong><small id="priceCoverage"></small></article><article class="panel kpi"><span class="muted small">Accounts / regions loaded</span><strong id="scopeCount">—</strong><small>Successful scopes only</small></article></div>
    <p class="notice small"><em>Cost is a USD reference estimate: current on-demand hourly rate × 730 hours for running instances. It is not billed cost. Storage, networking, licenses beyond the selected SKU, Spot discounts, Reserved Instances, and Savings Plans are excluded. Missing prices remain unknown.</em></p>
    <section id="scopeProblems" class="panel coverage-panel" hidden><details id="coverageDetails"><summary id="coverageSummary">Account and region coverage</summary><ul id="scopeIssues" class="scope-issues small"></ul></details></section>
    <section class="panel filter-panel"><div class="row"><h2>Filter instances</h2><button id="clearFilters" type="button">Clear filters</button></div><form id="filterForm" class="controls" role="search" autocomplete="off"><label id="hardwareControl">Hardware<select id="hardwareFilter"><option value="all">All hardware</option><option value="x86">x86</option><option value="graviton">Graviton</option><option value="other-arm">Other / unverified Arm</option><option value="gpu">GPU enabled</option><option value="no-gpu">No GPU</option><option value="unknown-gpu">GPU unknown</option><option value="unknown-cpu">CPU architecture unknown</option></select></label><label>State<select id="stateFilter"><option value="all">All states</option><option>running</option><option>stopped</option><option>pending</option><option>stopping</option><option>shutting-down</option><option>terminated</option></select></label><label>Instance type<select id="typeFilter"><option value="">All instance types</option></select></label><label>Instance size<select id="sizeFilter"><option value="">All sizes</option></select></label><label id="sortControl">Sort by<select id="sort"><option value="cost">Highest estimated cost</option><option value="cost-low">Lowest estimated cost</option><option value="name">Name A–Z</option><option value="type">Instance type A–Z</option><option value="size">Largest · vCPU / RAM</option><option value="size-small">Smallest · vCPU / RAM</option><option value="memory">Most RAM</option><option value="owner">Owner / user A–Z</option><option value="tags-few">Fewest tags</option><option value="tags-most">Most tags</option><option value="tags">Tag keys/values A–Z</option><option value="launch">Newest launch</option></select></label><details id="advancedFilters" class="grow"><summary>Owner/user, tags, and cost filters</summary><div class="controls"><label>Owner / user (tags)<select id="ownerFilter"><option value="">All owners / users</option></select></label><label>Tags<select id="tagStatusFilter"><option value="all">Any tag status</option><option value="untagged">Without tags</option><option value="tagged">With tags</option><option value="no-owner">No owner / user tag</option></select></label><label class="grow">Tag key / value<input id="tagQuery" type="search" maxlength="256" placeholder="Key, value, or key=value" autocomplete="off" data-1p-ignore spellcheck="false"></label><label>Min cost / month · USD<input id="minCost" type="number" min="0" max="1000000000" step="any" placeholder="No minimum"></label><label>Max cost / month · USD<input id="maxCost" type="number" min="0" max="1000000000" step="any" placeholder="No maximum"></label></div></details></form><p id="filterStatus" class="small muted" role="status">Filters combine and apply across all tabs. Owners/users come from tags; cost ranges exclude unknown estimates.</p></section>
    </div><section id="overviewPanel" role="tabpanel" aria-labelledby="overviewTab" hidden>
      <div class="row"><p id="overviewScope" class="notice small"></p><button id="overviewLoadMore" hidden>Load next AWS pages</button></div><p id="overviewFreshness" class="small muted"></p>
      <div class="pie-grid"><section class="panel"><h2>Instance types</h2><svg id="typePie" class="pie-chart" role="img" aria-label="Instance type distribution"></svg><ul id="typePieLegend" class="pie-legend" aria-label="Instance type counts and shares"></ul></section><section class="panel"><h2>x86 and Graviton</h2><svg id="cpuPie" class="pie-chart" role="img" aria-label="CPU architecture distribution"></svg><ul id="cpuPieLegend" class="pie-legend" aria-label="CPU architecture counts and shares"></ul></section><section class="panel"><h2>GPU instances</h2><svg id="gpuPie" class="pie-chart" role="img" aria-label="GPU instance distribution"></svg><ul id="gpuPieLegend" class="pie-legend" aria-label="GPU counts and shares"></ul></section></div>
      <p class="notice small">GPU presence is separate from CPU architecture: GPU hosts can also be x86 or Graviton. Graviton requires AWS processor metadata; other or unverified Arm systems remain separate. Unknown GPU metadata is not counted as no GPU.</p>
      <section class="panel"><h2>Operating systems</h2><div id="osBars" class="bars" role="list" aria-label="Loaded instances by operating system"></div></section>

    </section>
    <section id="costsPanel" role="tabpanel" aria-labelledby="costsTab" hidden>
      <section class="panel" aria-labelledby="costTitle"><h2 id="costTitle">Cost overview</h2><p class="small muted">Current compute estimate at AWS on-demand reference rates. This is not actual billed spend. Amounts follow all active inventory filters.</p><div class="kpis"><article class="panel kpi"><span class="muted small">Known compute / hour</span><strong id="costHourly">—</strong></article><article class="panel kpi"><span class="muted small">Known compute / day · 24 h</span><strong id="costDaily">—</strong></article><article class="panel kpi"><span class="muted small">Known compute / month · 730 h</span><strong id="costMonthly">—</strong></article><article class="panel kpi"><span class="muted small">Running instances priced</span><strong id="costPriced">—</strong><small id="costCoverage"></small></article></div><p id="costNote" class="notice small"></p><div class="cost-grid"><section class="panel"><h3>Cost by account · USD / month</h3><div id="accountCosts" class="bars cost-bars" role="list" aria-label="Monthly reference cost by account"></div></section><section class="panel"><h3>Cost by instance type · USD / month</h3><div id="typeCosts" class="bars cost-bars" role="list" aria-label="Monthly reference cost by instance type"></div></section></div><h3 class="notice">Highest estimated instance costs</h3><div class="table-wrap"><table><thead><tr><th>Instance name</th><th>Account / region</th><th>Size</th><th class="numeric">USD / hour</th><th class="numeric">USD / month · 730 h</th></tr></thead><tbody id="costInstances"></tbody></table></div></section>
    </section>
    <section id="anomaliesPanel" role="tabpanel" aria-labelledby="anomaliesTab" hidden>
      <section class="panel"><div class="row"><h2>EC2 review signals</h2><button id="anomalyLoadMore" type="button" hidden>Load next AWS pages</button></div><p class="muted small">Review current inventory and ask the AWS agent to check recent CPU evidence. These are snapshot rules, not measured billing spikes or proof of idle capacity.</p><form id="anomalyForm" class="controls"><label>Show signals<select id="anomalyRule"><option value="all">All signals</option><option value="high_reference_cost">High estimated cost</option><option value="untagged">Without tags</option><option value="missing_required_tags">Missing required tags · tagged</option><option value="aged_stopped">Older stopped instances</option></select></label><label>Monthly reference cost ≥ USD<input id="minMonthly" type="number" min="0" max="1000000" step="any" value="500" required></label><label>Stopped instance launch age ≥ days<input id="stoppedDays" type="number" min="1" max="3650" step="1" value="60" required></label><label class="grow">Required tag keys<input id="requiredTags" value="Owner,Environment" maxlength="500" autocomplete="off" data-1p-ignore spellcheck="false"></label><button id="investigateAnomalies" class="primary" type="submit" disabled>Investigate with AWS agent</button></form><p id="anomalySummary" class="notice small" role="status" aria-live="polite"></p><p id="anomalyCoverage" class="small muted"></p><p class="small muted">Tag absence is flagged only when every reported tag is loaded. Launch age is measured from launch time, not time spent stopped. The agent reviews at most five highest-ranked instances across selected scopes; CPU history covers the last seven completed UTC days.</p></section>
      <section id="anomalyAnalysis" class="panel" hidden><h2>AWS agent investigation</h2><p id="anomalyAnalysisStatus" class="notice small" role="status" aria-live="polite"></p><div id="anomalyAnalysisResults"></div></section><div id="anomalyFindings"></div>
    </section>
    <div id="instancesPanel" role="tabpanel" aria-labelledby="instancesTab">
    <section id="inventoryList" class="panel" aria-labelledby="inventoryTitle"><div class="row"><h2 id="inventoryTitle">Instance inventory</h2><span id="freshness" class="muted small"></span></div><p id="gpuNotice" class="notice small" hidden></p><p class="small muted">Search, charts, and totals share the fetched AWS inventory, including all returned tags. Complete coverage means all AWS pages in the requested account/region scopes have been fetched. Incomplete scopes remain explicit.</p><div class="table-wrap"><table class="inventory"><thead><tr><th scope="col">Instance name</th><th scope="col">Account / profile</th><th scope="col">Owner / user (tags)</th><th scope="col">Region</th><th scope="col">Size</th><th scope="col">OS</th><th scope="col">State</th><th scope="col" class="numeric">USD / hour</th><th scope="col" class="numeric">Est. USD / mo</th><th scope="col">Tags</th><th scope="col">Details</th></tr></thead><tbody id="instanceRows"></tbody></table></div><nav class="row pagination" aria-label="Inventory pages"><span id="pageInfo" class="muted small"></span><div class="actions"><label>Rows<select id="pageSize"><option>10</option><option selected>25</option><option>50</option></select></label><button id="previous" disabled>Previous</button><button id="next" disabled>Next</button><button id="loadMore" hidden>Load next AWS pages</button></div></nav></section>
    <section id="instanceDetail" class="panel" hidden aria-labelledby="detailTitle"><div class="row"><h2 id="detailTitle" tabindex="-1">Instance details</h2><div class="actions"><button id="stopInstance" class="stop-button" hidden>Stop instance</button><button id="askInstance">Ask AWS about this instance</button><button id="closeDetail">Back to results</button></div></div><div id="detailFields" class="detail-grid"></div><div class="row controls"><h3>Tags</h3><button id="allTags">Load all tags</button></div><p id="tagStatus" class="notice small" role="status"></p><dl id="tags"></dl></section>
    </div>
    <section class="panel"><details><summary>AWS API evidence and limitations</summary><div id="evidence"></div></details></section>
  </div><p id="assistantStatus" class="notice small" role="status"></p><footer id="accessNote" class="small muted">Inventory access follows the app read permission, configured accounts, and read-only AWS role. Questions and investigations use the caller-authorized MCP agent. OS version is shown only when reported by Systems Manager.</footer>
  <dialog id="stopDialog" aria-labelledby="stopDialogTitle"><h2 id="stopDialogTitle">Stop instance?</h2><p class="notice">This shuts down the selected instance. It does not terminate it. Attached EBS volumes remain, and storage charges can continue.</p><div id="stopTarget" class="stop-target"></div><label class="notice">Type the instance ID to confirm<input id="stopConfirmation" autocomplete="off" data-1p-ignore spellcheck="false"></label><p class="small muted">The confirmation expires after two minutes. AWS IAM checks your signed-in identity and instance permissions.</p><p id="stopStatus" role="status" aria-live="polite" class="notice"></p><div class="actions"><span id="stopSpinner" class="spinner" aria-hidden="true" hidden></span><button id="cancelStop" type="button">Cancel</button><button id="checkStopStatus" type="button" hidden>Check live status</button><button id="confirmStop" class="stop-button" type="button" disabled>Confirm stop</button></div></dialog>
  </main>${renderMicrofrontendClient("ec2")}${renderAgenticAppConversationClient()}<script>(${initializeEc2Dashboard.toString()})(${config},${validateEc2Response.toString()},${renderDonutSvg.toString()},${ec2CpuCategory.toString()},${buildEc2AnomalySignals.toString()},${validateEc2AnomalyResponse.toString()},${normalizeEc2Search.toString()},${validateEc2StopResponse.toString()},${createEc2Navigation.toString()});</script></body></html>`;
}

function initializeEc2Dashboard({ basePath, appPath, configuration }, validateResponse, renderDonutSvg, cpuCategory, buildSignals, validateInvestigation, normalizeSearch, validateStopResponse, createNavigation) {
  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
  const text = (id, value) => { byId(id).textContent = value; };
  const route = (path) => (basePath === "/" ? "" : basePath) + path;
  const money = (value) => value === null ? "Unknown" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 3 }).format(value);
  const monthly = (row) => { const value = row.state === "running" ? row.pricing ? row.pricing.hourlyUsd * 730 : null : ["stopped", "terminated"].includes(row.state) ? 0 : null; return Number.isFinite(value) ? value : null; };
  const key = (row) => row.accountId + ":" + row.region + ":" + row.instanceId;
  function instanceName(row) {
    const tags = row?.tags || [];
    const values = [row?.name, tags.find((tag) => tag.key === "Name")?.value, tags.find((tag) => tag.key === "ApplicationName")?.value];
    return values.find((value) => typeof value === "string" && value.trim())?.trim() || "Unnamed instance";
  }
  function instanceUrl(row, tab = "instances") {
    const url = new URL(appPath, location.origin);
    url.search = new URLSearchParams({ profile: row.profile || "@default", region: row.region, instanceId: row.instanceId, tab }).toString();
    return url;
  }
  const state = { records: new Map(), scopes: new Map(), page: 1, selected: null, busy: false, hasSnapshot: false, mock: false, activeTab: "search", anomalyReports: [], anomalyErrors: [], anomaliesRunning: false, anomalyTargets: 0, lookupInstanceId: "", cacheHits: 0 };
  const tabNames = ["search", "instances", "gpu", "overview", "costs", "anomalies"];
  let stopCapability = { allowed: false, profiles: [] };
  let stopApproval;
  let stopOutcome = "";
  let stopExecuting = false;
  let stopDialogVersion = 0;
  let controller;
  let timer;
  let tagController;
  let anomalyController;
  let generation = 0;
  let cachePollTimer;
  let lastBackgroundRefresh = null;
  let cachePollingStopped = false;
  const addOption = (select, value, label) => { const option = document.createElement("option"); option.value = value; option.textContent = label; select.append(option); };
  if (configuration.accounts.length > 1) {
    addOption(byId("profile"), "*", "All configured accounts");
  }
  for (const account of configuration.accounts) addOption(byId("profile"), account.profile || "@default", account.label || account.profile + (account.accountId ? " · " + account.accountId : ""));
  if (configuration.regions.length > 1) addOption(byId("region"), "*", "All configured regions");
  for (const region of configuration.regions) addOption(byId("region"), region, region);
  const filterParams = [["type", "typeFilter"], ["size", "sizeFilter"], ["owner", "ownerFilter"], ["tags", "tagQuery"], ["tagStatus", "tagStatusFilter"], ["minCost", "minCost"], ["maxCost", "maxCost"], ["signal", "anomalyRule"], ["highCost", "minMonthly"], ["stoppedDays", "stoppedDays"], ["requiredTags", "requiredTags"]];
  const urlControls = [["profile", "profile"], ["region", "region"], ["search", "search"], ["searchIn", "searchIn"], ["state", "stateFilter"], ["hardware", "hardwareFilter"], ["sort", "sort"], ["rows", "pageSize"], ...filterParams];
  const defaults = new Map(urlControls.map(([, id]) => [id, byId(id).value]));
  let invalidLink = false;
  let restoringQuery = false;
  let requestedInstance = "";
  let returnToResults = null;
  let navigation;
  let textTimer;
  let editingControl = null;
  let editStarted = false;
  function applyQuery(search) {
    const params = new URLSearchParams(search);
    invalidLink = false;
    for (const [name, id] of urlControls) {
      const control = byId(id); let value = params.get(name) ?? defaults.get(id);
      if (value.length > (id === "requiredTags" ? 500 : 256) || /[\u0000-\u001f]/.test(value)) { invalidLink = true; value = defaults.get(id); }
      if (control.tagName === "SELECT" && ![...control.options].some((option) => option.value === value)) {
        if (["typeFilter", "sizeFilter", "ownerFilter"].includes(id) && value) addOption(control, value, value);
        else { invalidLink = true; value = defaults.get(id); }
      }
      if (control.type === "number" && value && (!Number.isFinite(Number(value)) || Number(value) < Number(control.min) || Number(value) > Number(control.max))) { invalidLink = true; value = defaults.get(id); }
      control.value = value;
    }
    requestedInstance = params.get("instanceId") || params.get("instance") || "";
    if (requestedInstance && !/^i-[a-f0-9]{8}(?:[a-f0-9]{9})?$/.test(requestedInstance)) { invalidLink = true; requestedInstance = ""; }
    state.lookupInstanceId = requestedInstance;
    state.page = /^\d{1,6}$/.test(params.get("page") || "") ? Math.max(1, Number(params.get("page"))) : 1;
    byId("quickSearch").value = params.get("search")?.slice(0, 256) || "";
    byId("maxCost").setCustomValidity("");
    byId("advancedFilters").open = ["ownerFilter", "tagQuery", "minCost", "maxCost"].some((id) => byId(id).value) || byId("tagStatusFilter").value !== "all";
    const tab = params.get("tab") || (requestedInstance || urlControls.slice(3).some(([name]) => params.has(name)) ? "instances" : "search");
    restoringQuery = true;
    activateTab(requestedInstance && !["instances", "gpu"].includes(tab) ? "instances" : tab);
    restoringQuery = false;
  }
  function viewQuery() {
    const params = new URLSearchParams();
    params.set("tab", state.activeTab === "overview" ? "analytics" : state.activeTab);
    const row = ["instances", "gpu"].includes(state.activeTab) ? state.records.get(state.selected) : null;
    if (row) return instanceUrl(row, state.activeTab === "gpu" ? "gpu" : "instances").searchParams.toString();
    for (const [name, id] of urlControls) {
      const value = name === "search" && state.activeTab === "search" ? byId("quickSearch").value : byId(id).value;
      if (value !== defaults.get(id)) params.set(name, value);
    }
    if (state.page > 1) params.set("page", String(state.page));
    if (requestedInstance) params.set("instanceId", requestedInstance);
    return params.toString();
  }
  function commitView(mode = "push") { clearTimeout(textTimer); navigation?.commit(viewQuery(), mode); }
  function textChanged(control) {
    if (editingControl !== control) { editingControl = control; editStarted = false; }
    clearTimeout(textTimer);
    textTimer = setTimeout(() => { commitView(editStarted ? "replace" : "push"); editStarted = true; }, 250);
  }
  function finishEdit() { if (textTimer) { clearTimeout(textTimer); textTimer = null; commitView(editStarted ? "replace" : "push"); } editingControl = null; editStarted = false; }
  function scrollWithinFrame() { window.scrollTo({ top: 0, behavior: "instant" }); }
  function restoreView(search) {
    clearTimeout(textTimer); textTimer = null; editingControl = null; editStarted = false;
    controller?.abort(); tagController?.abort(); anomalyController?.abort(); generation += 1;
    state.selected = null; state.selectedSignal = null;
    // Navigation never restores a stop approval or repeats a mutation.
    if (!stopExecuting) {
      stopDialogVersion += 1; stopApproval = null; byId("stopConfirmation").value = "";
      if (byId("stopDialog").open) byId("stopDialog").close();
    }
    setBusy(false); resetAnomalyAnalysis();
    applyQuery(search); scrollWithinFrame();
    byId(state.activeTab === "search" ? "quickSearch" : state.activeTab + "Tab").focus({ preventScroll: true });
    if (invalidLink) { text("status", "This link has an invalid instance, scope, or filter setting. Choose a configured scope to search."); return; }
    void loadInventory(false, false, Boolean(requestedInstance), true);
  }

  function selectedScopes() {
    if (!byId("scopeForm").reportValidity()) return [];
    const profile = byId("profile").value;
    if (!profile && configuration.accounts.length > 1) return [];
    const accounts = profile === "*" ? configuration.accounts : configuration.accounts.filter((account) => (account.profile || "@default") === profile);
    const regions = byId("region").value === "*" ? configuration.regions : [byId("region").value];
    return accounts.flatMap((account) => regions.map((region) => ({ profile: account.profile, region, nextToken: null, status: "pending", pages: 0, warnings: [], evidence: [] })));
  }
  async function requestPlan(input, signal) {
    const response = await fetch(route("/api/anomaly-request"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal });
    const payload = await readAgenticAppJsonResponse(response, "Could not prepare AWS inventory request");
    return payload.data;
  }
  function beginProgress(title, detail) {
    clearInterval(timer);
    const started = Date.now();
    byId("progress").hidden = false;
    byId("progress").classList.remove("finished");
    byId("spinner").hidden = false;
    byId("cancel").hidden = false;
    text("progressTitle", title);
    text("progressDetail", detail);
    const tick = () => { const seconds = Math.floor((Date.now() - started) / 1000); text("elapsed", Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0") + " elapsed"); };
    tick(); timer = setInterval(tick, 1000);
  }
  function finishProgress(title, detail) { clearInterval(timer); byId("progress").classList.add("finished"); byId("spinner").hidden = true; byId("cancel").hidden = true; text("progressTitle", title); text("progressDetail", detail); }
  function setBusy(value) {
    state.busy = value;
    for (const id of ["searchPanel", "instancesPanel", "overviewPanel", "costsPanel", "anomaliesPanel"]) byId(id).setAttribute("aria-busy", String(value));
    for (const id of ["load", "refresh", "loadMore", "overviewLoadMore", "anomalyLoadMore", "investigateAnomalies", "searchAll"]) byId(id).disabled = value;
    byId("allTags").disabled = value;
    byId("refresh").disabled = value || !state.hasSnapshot;
  }
  function cancel() {
    controller?.abort(); tagController?.abort(); anomalyController?.abort(); state.anomaliesRunning = false; generation += 1;
    setBusy(false);
    finishProgress("Canceled", "Stopped waiting in the browser. Shared inventory-cache reads or agent work already started on the server may continue.");
    for (const scope of state.scopes.values()) if (["loading", "pending"].includes(scope.status)) scope.status = "canceled";
    text("tagStatus", "Tag loading canceled; select Load all tags to retry.");
    render();
  }
  async function loadInventory(more = false, refresh = false, openInstance = Boolean(requestedInstance), preservePage = false) {
    const scopes = more ? [...state.scopes.values()].filter((scope) => scope.nextToken || ["error", "canceled"].includes(scope.status)) : selectedScopes();
    if (!scopes.length) return;
    resetAnomalyAnalysis();
    if (!more) state.lookupInstanceId = requestedInstance;
    controller?.abort(); tagController?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const current = ++generation;
    if (!more) {
      state.records.clear(); state.scopes.clear(); state.selected = null; state.mock = false; if (!preservePage) state.page = 1; state.cacheHits = 0;
      for (const scope of scopes) state.scopes.set(scope.profile + ":" + scope.region, scope);
      byId("instanceDetail").hidden = true;
    }
    for (const scope of scopes) scope.batches = 0;
    state.hasSnapshot = true;
    setBusy(true);
    beginProgress("Loading cached inventory…", "Loading shared snapshots for " + scopes.length + " account/region scope(s). Cached snapshots return immediately; fresh reads include all tags and metadata. No agent is used for inventory.");
    const queue = [...scopes];
    let completed = 0;
    const worker = async () => {
      while (queue.length && !signal.aborted) {
        const scope = queue.shift();
        const cursor = scope.nextToken || "";
        scope.status = "loading";
        try {
          const params = new URLSearchParams({ profile: scope.profile, region: scope.region });
          if (cursor) params.set("cursor", cursor);
          if (refresh) params.set("refresh", "1");
          if (state.lookupInstanceId) params.set("instanceId", state.lookupInstanceId);
          text("progressDetail", "Loading inventory · " + (scope.profile || "Default credentials") + " / " + scope.region + " · " + completed + "/" + scopes.length + " scopes completed. Loading every requested AWS page.");
          const response = await fetch(route(state.lookupInstanceId ? "/api/instance" : "/api/inventory") + "?" + params, { credentials: "same-origin", signal });
          const result = await readAgenticAppJsonResponse(response, "AWS inventory unavailable");
          if (signal.aborted || current !== generation) return;
          const configuredAccount = configuration.accounts.find((account) => account.profile === scope.profile);
          const data = validateResponse(result.data, { scope: { ...scope, accountId: configuredAccount.accountId || null }, cacheTtlMs: configuration.cacheTtlMs, cacheMaxStaleMs: configuration.cacheMaxStaleMs });
          if (data.nextToken && (data.nextToken === cursor || scope.seenTokens?.has(data.nextToken))) throw new Error("AWS returned the same pagination token; remaining coverage is unknown.");
          scope.seenTokens ??= new Set();
          if (cursor) scope.seenTokens.add(cursor);
          for (const row of data.instances) state.records.set(key(row), row);
          scope.status = "ready"; scope.nextToken = data.nextToken; scope.pages += data.pages; scope.warnings = [...new Set([...scope.warnings, ...data.warnings])]; scope.evidence.push(...data.evidence); scope.accountId = data.accountId;
          scope.updatedAt = new Date(Math.min(Date.parse(scope.updatedAt || data.retrievedAt), Date.parse(data.retrievedAt))).toISOString();
          const previousCache = scope.cache;
          scope.batches += 1;
          scope.cache = { ...data.cache, hit: (previousCache?.hit ?? true) && data.cache?.hit, stale: Boolean(previousCache?.stale || data.cache?.stale), refreshError: data.cache?.refreshError || previousCache?.refreshError || null, expiresAt: new Date(Math.min(Date.parse(previousCache?.expiresAt || data.cache.expiresAt), Date.parse(data.cache.expiresAt))).toISOString() };
          state.cacheHits = [...state.scopes.values()].filter((entry) => entry.cache?.hit).length;
          state.mock ||= result.mock === true;
        } catch (error) {
          if (signal.aborted || current !== generation) return;
          scope.status = "error"; scope.error = error.message;
        }
        if (scope.status === "ready" && scope.nextToken && scope.batches < 200) queue.push(scope);
        else completed += 1;
        render();
      }
    };
    await Promise.all([worker(), worker()]);
    if (signal.aborted || current !== generation) return;
    const requestedPage = state.page;
    setBusy(false); render();
    if (state.page !== requestedPage) commitView("replace");
    const errors = [...state.scopes.values()].filter((scope) => scope.status === "error").length;
    finishProgress(errors ? "Inventory loaded with unavailable scopes" : "Inventory loaded", "Completed " + completed + " scope(s). " + (hasMore() ? "More AWS pages or failed scopes remain; use Load next AWS pages." : "All requested AWS pages are loaded.") + " " + state.cacheHits + " scope(s) served from cache (" + configuration.cacheTtlMs / 3_600_000 + " hours).");
    if (openInstance && state.lookupInstanceId) {
      const matches = [...state.records.values()].filter((entry) => entry.instanceId === state.lookupInstanceId);
      if (matches.length === 1) showDetail(key(matches[0]), false);
      else text("status", matches.length ? "This instance ID matches multiple accounts. Choose a specific account and region." : "The linked instance was not found in the requested account and region.");
    }
  }
  function hasMore() { return [...state.scopes.values()].some((scope) => scope.nextToken || ["error", "canceled"].includes(scope.status)); }
  function hardwareMatches(row) {
    if (state.activeTab === "gpu") return row.gpu === true;
    const filter = byId("hardwareFilter").value;
    const cpu = cpuCategory(row);
    return filter === "all" || (filter === "x86" && cpu === "x86") || (filter === "graviton" && cpu === "Graviton") || (filter === "other-arm" && ["Other Arm", "Arm · manufacturer unknown"].includes(cpu)) || (filter === "gpu" && row.gpu === true) || (filter === "no-gpu" && row.gpu === false) || (filter === "unknown-gpu" && row.gpu === null) || (filter === "unknown-cpu" && cpu === "Unknown architecture");
  }
  const ownerIdentity = (value) => value.normalize("NFKC").trim().toLowerCase();
  function ownerValues(row) {
    const keys = (configuration.ownerTagKeys || ["Owner", "ResourceOwner", "User", "Username", "CreatedBy", "Email"]).map(normalizeSearch);
    const values = new Map();
    for (const key of keys) for (const tag of row.tags || []) {
      if (normalizeSearch(tag.key) !== key || !tag.value.trim()) continue;
      const value = tag.value.trim(); if (!values.has(ownerIdentity(value))) values.set(ownerIdentity(value), value);
    }
    return [...values.values()];
  }
  function tagMatches(row, query) {
    query = query.trim(); if (!query) return true;
    const search = normalizeSearch(query); if (!search) return false;
    const equals = query.indexOf("=");
    if (equals >= 0) {
      const tagKey = normalizeSearch(query.slice(0, equals));
      const rawValue = query.slice(equals + 1).trim(); const tagValue = normalizeSearch(rawValue);
      return Boolean(tagKey) && (!rawValue || Boolean(tagValue)) && row.tags.some((tag) => normalizeSearch(tag.key) === tagKey && normalizeSearch(tag.value).includes(tagValue));
    }
    return row.tags.some((tag) => [tag.key, tag.value, tag.key + "=" + tag.value].some((value) => normalizeSearch(value).includes(search)));
  }
  function rowMatchesQuery(row, input, mode = "all") {
    const query = input.trim(); if (!query) return true;
    const search = normalizeSearch(query); if (!search) return false;
    if (mode === "tags" || (mode !== "name" && query.includes("="))) return tagMatches(row, query);
    const names = [row.instanceId, instanceName(row)];
    const fields = mode === "name" ? names : [...names, ...row.tags.flatMap((tag) => [tag.key, tag.value, tag.key + "=" + tag.value]), ...ownerValues(row), row.instanceType, row.platform, row.osVersion, row.cpuManufacturer, cpuCategory(row), row.profile, row.accountId, row.region];
    return fields.some((value) => normalizeSearch(value).includes(search));
  }
  function searchMatches(row) { return rowMatchesQuery(row, byId("search").value, byId("searchIn").value); }
  function populateFilters() {
    const rows = [...state.records.values()];
    const update = (id, first, values) => {
      const select = byId(id); const selected = select.value;
      select.replaceChildren(); addOption(select, "", first);
      for (const [value, label] of values) addOption(select, value, label);
      if (selected && ![...select.options].some((option) => option.value === selected)) addOption(select, selected, selected + " · not in loaded inventory");
      select.value = selected;
    };
    const types = [...new Set(rows.map((row) => row.instanceType))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const sizes = [...new Set(types.map((type) => type.split(".").at(-1)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const owners = new Map(); for (const row of rows) for (const owner of ownerValues(row)) if (!owners.has(ownerIdentity(owner))) owners.set(ownerIdentity(owner), owner);
    update("typeFilter", "All instance types", types.map((value) => [value, value]));
    update("sizeFilter", "All sizes", sizes.map((value) => [value, value]));
    update("ownerFilter", "All owners / users", [["@missing", "No owner / user tag"], ...[...owners].sort((a, b) => a[1].localeCompare(b[1])).map(([key, value]) => ["owner:" + key, value])]);
  }
  function matchingRows() {
    const min = byId("minCost").value; const max = byId("maxCost").value;
    byId("maxCost").setCustomValidity(min !== "" && max !== "" && Number(min) > Number(max) ? "Maximum cost must be at least the minimum cost." : "");
    if (!byId("filterForm").checkValidity()) { text("filterStatus", "Enter a valid cost range: minimum and maximum must be nonnegative, with maximum at least minimum."); return []; }
    text("filterStatus", "Filters combine and apply across all tabs. Owners/users come from tags; cost ranges exclude unknown estimates.");
    const rows = [...state.records.values()].filter((row) => {
      const owners = ownerValues(row); const completeTags = row.tags.length === row.tagCount;
      const owner = byId("ownerFilter").value; const tagStatus = byId("tagStatusFilter").value;
      const amount = monthly(row);
      return hardwareMatches(row) && (byId("stateFilter").value === "all" || row.state === byId("stateFilter").value)
        && (!byId("typeFilter").value || row.instanceType === byId("typeFilter").value)
        && (!byId("sizeFilter").value || row.instanceType.split(".").at(-1) === byId("sizeFilter").value)
        && (!owner || (owner === "@missing" ? completeTags && !owners.length : owners.some((value) => "owner:" + ownerIdentity(value) === owner)))
        && (tagStatus === "all" || (tagStatus === "untagged" && completeTags && row.tagCount === 0) || (tagStatus === "tagged" && row.tags.length > 0) || (tagStatus === "no-owner" && completeTags && !owners.length))
        && tagMatches(row, byId("tagQuery").value)
        && (min === "" || (amount !== null && amount >= Number(min))) && (max === "" || (amount !== null && amount <= Number(max))) && searchMatches(row);
    });
    const sort = byId("sort").value;
    const numeric = (a, b, field, direction) => (a[field] === null) - (b[field] === null) || (a[field] === null ? 0 : direction * (a[field] - b[field]));
    return rows.sort((a, b) => {
      let result = 0;
      if (["cost", "cost-low"].includes(sort)) result = (monthly(a) === null) - (monthly(b) === null) || (sort === "cost" ? -1 : 1) * ((monthly(a) ?? 0) - (monthly(b) ?? 0));
      else if (sort === "type") result = a.instanceType.localeCompare(b.instanceType, undefined, { numeric: true });
      else if (["size", "size-small"].includes(sort)) result = numeric(a, b, "vcpu", sort === "size" ? -1 : 1) || numeric(a, b, "memoryGiB", sort === "size" ? -1 : 1);
      else if (sort === "memory") result = numeric(a, b, "memoryGiB", -1) || numeric(a, b, "vcpu", -1);
      else if (sort === "owner") { const av = ownerValues(a)[0] || ""; const bv = ownerValues(b)[0] || ""; result = (!av) - (!bv) || av.localeCompare(bv); }
      else if (["tags-few", "tags-most"].includes(sort)) result = (sort === "tags-most" ? -1 : 1) * (a.tagCount - b.tagCount);
      else if (sort === "tags") { const tags = (row) => row.tags.map((tag) => tag.key + "=" + tag.value).sort().join(" "); result = tags(a).localeCompare(tags(b)); }
      else if (sort === "launch") result = String(b.launchTime || "").localeCompare(String(a.launchTime || ""));
      return result || instanceName(a).localeCompare(instanceName(b)) || key(a).localeCompare(key(b));
    });
  }
  function bars(id, rows, field) {
    const groups = new Map();
    for (const row of rows) { const label = row[field] || "Unknown"; groups.set(label, (groups.get(label) || 0) + 1); }
    const sorted = [...groups].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const values = sorted.length > 7 ? [...sorted.slice(0, 6), ["Other", sorted.slice(6).reduce((sum, entry) => sum + entry[1], 0)]] : sorted;
    const maximum = Math.max(1, ...values.map((entry) => entry[1]));
    byId(id).innerHTML = values.length ? values.map(([label, count]) => '<div class="bar-row" role="listitem"><span>' + escapeHtml(label) + '</span><div class="bar-track" aria-hidden="true"><i style="width:' + count / maximum * 100 + '%"></i></div><strong class="numeric">' + count + '</strong></div>').join("") : '<p class="muted small">No matching instances in this snapshot. Try Search all accounts & regions.</p>';
  }
  function renderCostOverview(rows) {
    const known = rows.filter((row) => monthly(row) !== null);
    const total = known.reduce((sum, row) => sum + monthly(row), 0);
    const unknown = rows.length - known.length;
    const running = rows.filter((row) => row.state === "running");
    const priced = running.filter((row) => row.pricing);
    const hasEstimate = known.length > 0 || rows.length === 0;
    text("costHourly", money(hasEstimate ? total / 730 : null));
    text("costDaily", money(hasEstimate ? total / 730 * 24 : null));
    text("costMonthly", money(hasEstimate ? total : null));
    text("costPriced", priced.length + " / " + running.length);
    text("costCoverage", unknown + " instance(s) with unknown modeled compute cost");
    text("costNote", (unknown ? "Partial known subtotal: unpriced running and transitional instances are excluded. " : "") + "Running compute is modeled continuously at the current reference rate; stopped/terminated compute is zero. Storage, networking, Spot discounts, reservations, Savings Plans, and additional licenses are excluded. Coverage and snapshot times above apply to these estimates.");
    const bars = (id, labelFor) => {
      const groups = new Map();
      for (const row of rows) {
        const label = labelFor(row); const group = groups.get(label) || { label, amount: 0, known: 0, unknown: 0 };
        const value = monthly(row);
        if (value === null) group.unknown += 1; else { group.amount += value; group.known += 1; }
        groups.set(label, group);
      }
      const all = [...groups.values()].sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
      const sorted = all.slice(0, 8);
      if (all.length > 8) sorted.push(all.slice(8).reduce((group, row) => ({ label: "Other groups", amount: group.amount + row.amount, known: group.known + row.known, unknown: group.unknown + row.unknown }), { amount: 0, known: 0, unknown: 0 }));
      const maximum = Math.max(1, ...sorted.map((group) => group.amount));
      byId(id).innerHTML = sorted.map((group) => '<div class="bar-row" role="listitem"><span>' + escapeHtml(group.label) + '</span><div class="bar-track" aria-hidden="true"><i style="width:' + group.amount / maximum * 100 + '%"></i></div><span class="numeric"><strong>' + money(group.known ? group.amount : null) + '</strong>' + (group.unknown ? '<small><br>+' + group.unknown + ' unknown</small>' : '') + '</span></div>').join("") || '<p class="muted small">No matching inventory loaded.</p>';
    };
    bars("accountCosts", (row) => row.profile || row.accountId);
    bars("typeCosts", (row) => row.instanceType);
    byId("costInstances").innerHTML = [...priced].sort((a, b) => monthly(b) - monthly(a) || instanceName(a).localeCompare(instanceName(b))).slice(0, 10).map((row) => '<tr><td><a href="' + escapeHtml(instanceUrl(row).toString()) + '">' + escapeHtml(instanceName(row)) + '</a><div class="small muted">' + escapeHtml(row.instanceId) + '</div></td><td>' + escapeHtml((row.profile || row.accountId) + ' / ' + row.region) + '</td><td>' + escapeHtml(row.instanceType) + '</td><td class="numeric">' + money(row.pricing.hourlyUsd) + '</td><td class="numeric">' + money(monthly(row)) + '</td></tr>').join("") || '<tr><td colspan="5" class="empty">No priced running instances in this view.</td></tr>';
  }
  function renderOverview(rows) {
    const group = (labelFor) => {
      const counts = new Map();
      for (const row of rows) { const label = labelFor(row); counts.set(label, (counts.get(label) || 0) + 1); }
      return [...counts].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    };
    const colors = ["#67e8f9", "#a5b4fc", "#fbbf24", "#f472b6", "#34d399", "#60a5fa"];
    const typeRows = group((row) => row.instanceType);
    const visibleTypes = typeRows.slice(0, 6);
    state.typeColors ??= new Map();
    const used = new Set();
    for (const row of visibleTypes) {
      let color = state.typeColors.get(row.name);
      if (!color || used.has(color)) color = colors.find((entry) => !used.has(entry));
      state.typeColors.set(row.name, color); row.color = color; used.add(color);
    }
    if (typeRows.length > 6) visibleTypes.push({ name: "Other types", value: typeRows.slice(6).reduce((sum, row) => sum + row.value, 0), color: "#94a3b8" });
    const cpuColors = { x86: "#67e8f9", Graviton: "#a5b4fc", "Other Arm": "#fbbf24", "Arm · manufacturer unknown": "#94a3b8", "Other architecture": "#f472b6", "Unknown architecture": "#64748b" };
    const gpuColors = { "GPU enabled": "#fbbf24", "No GPU": "#67e8f9", "GPU unknown": "#94a3b8" };
    const pie = (id, values, label) => {
      const total = values.reduce((sum, row) => sum + row.value, 0);
      const chart = byId(id);
      chart.setAttribute("viewBox", "0 0 240 240");
      chart.innerHTML = renderDonutSvg(values, { totalLabel: total, unit: "instances", emptyLabel: "No data" });
      chart.setAttribute("aria-label", total ? label + ": " + values.map((row) => row.name + " " + row.value + " (" + (row.value / total * 100).toFixed(1) + "%)").join(", ") : label + ": no inventory data");
      byId(id + "Legend").innerHTML = total > 0 ? values.map((row) => '<li><i aria-hidden="true" style="background:' + row.color + '"></i><span>' + escapeHtml(row.name) + '</span><span class="numeric"><strong>' + row.value + '</strong> · ' + (row.value / total * 100).toFixed(1) + '%</span></li>').join("") : '<li>No matching inventory data.</li>';
    };
    pie("typePie", visibleTypes, "Instance type distribution");
    const cpus = group(cpuCategory);
    for (const name of ["x86", "Graviton"]) if (!cpus.some((row) => row.name === name)) cpus.push({ name, value: 0 });
    pie("cpuPie", cpus.map((row) => ({ ...row, color: cpuColors[row.name] })), "CPU architecture distribution");
    const gpus = new Map(group((row) => row.gpu === null ? "GPU unknown" : row.gpu ? "GPU enabled" : "No GPU").map((row) => [row.name, row.value]));
    pie("gpuPie", ["GPU enabled", "No GPU", "GPU unknown"].map((name) => ({ name, value: gpus.get(name) || 0, color: gpuColors[name] })), "GPU presence");
    text("overviewFreshness", byId("freshness").textContent);
    text("overviewScope", rows.length + " matching loaded instances · " + byId("profile").selectedOptions[0].textContent + " · " + byId("region").selectedOptions[0].textContent + ". Counts and shares use the same search, state, and hardware filters as the Instances tab.");
  }
  function activateTab(name, focus = false, reloadCached = false) {
    if (name === "analytics") name = "overview";
    const next = tabNames.includes(name) ? name : "search";
    const search = next === "search";
    const expandSearchScope = search && state.hasSnapshot && (state.lookupInstanceId || (configuration.accounts.length > 1 && byId("profile").value !== "*") || (configuration.regions.length > 1 && byId("region").value !== "*"));
    if (search) {
      if (configuration.accounts.length > 1) byId("profile").value = "*";
      if (configuration.regions.length > 1) byId("region").value = "*";
    }
    if (reloadCached || (state.activeTab !== next && ([state.activeTab, next].includes("gpu") || search))) {
      resetAnomalyAnalysis(); state.page = 1;
      state.selected = null;
    }
    state.activeTab = next;
    for (const tab of tabNames) {
      const active = tab === next;
      byId(tab + "Tab").setAttribute("aria-selected", String(active));
      byId(tab + "Tab").tabIndex = active ? 0 : -1;
      if (active && focus) byId(tab + "Tab").focus();
    }
    byId("searchPanel").hidden = !search;
    for (const id of ["scopePanel", "headerActions", "cacheStatus", "status", "accessNote"]) byId(id).hidden = search;
    const inventory = ["instances", "gpu"].includes(next);
    byId("instancesPanel").hidden = !inventory;
    byId("instancesPanel").setAttribute("aria-labelledby", inventory ? next + "Tab" : "instancesTab");
    byId("overviewPanel").hidden = next !== "overview";
    byId("costsPanel").hidden = next !== "costs";
    byId("anomaliesPanel").hidden = next !== "anomalies";
    byId("sortControl").hidden = !inventory;
    byId("hardwareControl").hidden = next === "gpu";
    byId("gpuNotice").hidden = next !== "gpu";
    text("inventoryTitle", next === "gpu" ? "GPU instances" : "Instance inventory");
    byId("instanceDetail").hidden = !inventory || !state.selected;
    render();
    if (reloadCached) { requestedInstance = ""; state.selected = null; state.lookupInstanceId = ""; commitView(); scrollWithinFrame(); }

    if (reloadCached || expandSearchScope) {
      if (state.busy) cancel();
      if (search) byId("search").value = "";
      void loadInventory(false, false, false).then(() => {
        if (reloadCached && state.activeTab === next && !state.busy) {
          scrollWithinFrame();
        }
      });
    }
  }
  function renderQuickSearch(scopes) {
    const query = byId("quickSearch").value.trim();
    const rows = query ? [...state.records.values()].filter((row) => rowMatchesQuery(row, query)).sort((a, b) => instanceName(a).localeCompare(instanceName(b)) || key(a).localeCompare(key(b))) : [];
    const partial = scopes.some((scope) => scope.status !== "ready" || scope.nextToken);
    text("quickSearchStatus", query ? rows.length + " matching instance(s)" + (rows.length > 12 ? " · showing the first 12" : "") + (state.busy ? " · loading inventory…" : partial ? " · some AWS scopes are unavailable or incomplete" : " · all configured accounts and regions") : "Search across all configured accounts and regions." + (state.busy ? " Loading cached inventory…" : partial ? " Some AWS scopes are unavailable or incomplete." : ""));
    byId("quickResults").innerHTML = rows.slice(0, 12).map((row) => '<li><a data-quick-instance="' + escapeHtml(key(row)) + '" href="' + escapeHtml(instanceUrl(row).toString()) + '"><strong>' + escapeHtml(instanceName(row)) + '</strong><span>' + escapeHtml((row.profile || "Default credentials") + " · " + row.region + " · " + row.instanceType + " · " + row.state) + '</span><span>' + escapeHtml(row.instanceId) + '</span></a></li>').join("");
    byId("allSearchResults").hidden = rows.length <= 12;
  }
  function render() {
    const detail = Boolean(state.selected) && ["instances", "gpu"].includes(state.activeTab);
    byId("fleetSummary").hidden = detail;
    byId("inventoryList").hidden = detail;
    byId("scopePanel").hidden = detail || state.activeTab === "search";
    byId("instanceDetail").hidden = !detail;
    byId("content").hidden = !state.hasSnapshot || state.activeTab === "search";
    if (state.activeTab === "search" && !state.busy) byId("progress").hidden = true;
    const scopes = [...state.scopes.values()];
    renderQuickSearch(scopes);
    const loaded = scopes.filter((scope) => scope.pages > 0 || scope.status === "ready");
    const issues = scopes.flatMap((scope) => [...(["error", "canceled", "loading", "pending"].includes(scope.status) ? [scope.status === "error" ? scope.error : scope.status + "; coverage is not complete."] : []), ...(scope.nextToken ? ["More AWS pages remain."] : []), ...(scope.cache?.stale ? ["Serving a stale cached snapshot while refresh is retried."] : []), ...(scope.cache?.refreshError ? ["Last refresh failed: " + scope.cache.refreshError] : []), ...scope.warnings].map((issue) => (scope.profile || "Default credentials") + " / " + scope.region + ": " + issue));
    byId("scopeProblems").hidden = !issues.length;
    const failed = scopes.filter((scope) => ["error", "canceled"].includes(scope.status)).length;
    text("coverageSummary", "Coverage: " + loaded.length + "/" + scopes.length + " account/region scopes loaded · " + scopes.filter((scope) => scope.nextToken).length + " with more AWS pages" + (failed ? " · " + failed + " unavailable" : "") + " · details");
    if (failed) byId("coverageDetails").open = true;
    byId("scopeIssues").innerHTML = issues.map((issue) => '<li>' + escapeHtml(issue) + '</li>').join("");
    byId("search").placeholder = ({ all: "Name, instance ID, tag, or key=value", name: "Name or instance ID", tags: "Tag key, value, or key=value" })[byId("searchIn").value];
    populateFilters();
    const rows = matchingRows();
    const unknownGpu = [...state.records.values()].filter((row) => row.gpu === null).length;
    text("gpuNotice", "Only instances with confirmed GPU hardware are shown. " + unknownGpu + " instance(s) in the fetched inventory have unknown GPU status and are excluded. Search names, instance IDs, or all tags to narrow this list.");
    const known = rows.filter((row) => row.state === "running" && row.pricing);
    const running = rows.filter((row) => row.state === "running");
    text("instanceCount", rows.length);
    text("coverageCount", state.records.size + (state.lookupInstanceId ? " instance(s) in direct lookup · " : " instances fetched · ") + (hasMore() || scopes.some((scope) => scope.status !== "ready") ? "Partial AWS coverage" : "Complete requested AWS scope"));
    text("stateCount", running.length + " / " + rows.filter((row) => row.state === "stopped").length);
    text("monthlyCost", known.length ? money(known.reduce((sum, row) => sum + monthly(row), 0)) : running.length ? "Unknown" : loaded.length ? money(0) : "Unknown");
    text("priceCoverage", known.length + "/" + running.length + " running instances priced" + (known.length < running.length ? " · partial estimate" : ""));
    text("scopeCount", new Set(loaded.map((scope) => scope.accountId)).size + " / " + new Set(loaded.map((scope) => scope.region)).size);
    text("status", (state.mock ? "Mock data · local preview. " : "") + (loaded.length ? "Loaded " + state.records.size + " instances from " + loaded.length + " account/region scope(s). " + state.cacheHits + " scope(s) from cache (" + configuration.cacheTtlMs / 3_600_000 + " hours)." + (scopes.some((scope) => scope.cache?.stale) ? " Stale cached scopes are labeled in coverage details." : "") : "No successful inventory pages yet; AWS coverage is unknown."));
    const dates = loaded.map((scope) => Date.parse(scope.updatedAt)).filter(Number.isFinite);
    const expires = loaded.map((scope) => Date.parse(scope.cache?.expiresAt)).filter(Number.isFinite);
    text("freshness", dates.length ? "Oldest snapshot " + new Date(Math.min(...dates)).toLocaleString() + (expires.length ? " · Cache expires by " + new Date(Math.min(...expires)).toLocaleString() : "") + " · Refresh live data bypasses the cache." : "");
    renderOverview(rows); renderCostOverview(rows); renderAnomalies(rows); bars("osBars", rows, "platform");
    const size = Number(byId("pageSize").value); const pages = Math.max(1, Math.ceil(rows.length / size)); if (!state.busy && state.hasSnapshot && !restoringQuery) state.page = Math.max(1, Math.min(state.page, pages));
    let emptyMessage = "No matching instances in this snapshot. Try Search all accounts & regions.";
    if (!loaded.length) emptyMessage = "Inventory unavailable; review scope errors above.";
    else if (state.activeTab === "gpu") emptyMessage = "No confirmed GPU instances match this search. Try Search all accounts & regions; unknown GPU hardware is excluded.";
    byId("instanceRows").innerHTML = rows.slice((state.page - 1) * size, state.page * size).map((row) => '<tr' + (state.selected === key(row) ? ' class="selected-row"' : '') + '><td><strong>' + escapeHtml(instanceName(row)) + '</strong><div class="muted small">' + escapeHtml(row.instanceId) + '</div></td><td>' + escapeHtml(row.accountId) + '<div class="muted small">' + escapeHtml(row.profile || "Default credentials") + '</div></td><td>' + escapeHtml(ownerValues(row).join(', ') || (row.tags.length === row.tagCount ? 'No owner tag' : 'Owner unknown')) + '</td><td>' + escapeHtml(row.region) + '</td><td>' + escapeHtml(row.instanceType) + '<div class="muted small">' + (row.vcpu === null ? "vCPU unknown" : row.vcpu + ' vCPU') + ' · ' + (row.memoryGiB === null ? 'RAM unknown' : row.memoryGiB + ' GiB') + '</div></td><td>' + escapeHtml(row.osVersion || row.platform || "Unknown") + '<div class="muted small">' + escapeHtml((row.architecture || "Architecture unknown") + (row.cpuManufacturer ? " · " + row.cpuManufacturer : "") + (row.gpu === true ? " · GPU" : "")) + '</div></td><td><span class="state ' + (row.state === 'running' ? 'running' : '') + '">' + escapeHtml(row.state) + '</span>' + (row.lifecycle ? '<div class="muted small">' + escapeHtml(row.lifecycle) + '</div>' : '') + '</td><td class="numeric">' + money(row.pricing?.hourlyUsd ?? null) + '</td><td class="numeric">' + money(monthly(row)) + '</td><td><div class="tag-stack">' + row.tags.slice(0, 2).map((tag) => '<span class="tag" title="' + escapeHtml(tag.key + '=' + tag.value) + '">' + escapeHtml(tag.key + '=' + tag.value) + '</span>').join('') + '<small>' + row.tagCount + ' tags</small></div></td><td><button data-instance="' + escapeHtml(key(row)) + '">View details</button></td></tr>').join("") || '<tr><td colspan="11" class="empty">' + emptyMessage + '</td></tr>';
    text("loadMore", scopes.some((scope) => scope.nextToken) ? "Load next AWS pages" : "Retry unavailable scopes");
    text("pageInfo", rows.length ? "Showing " + ((state.page - 1) * size + 1) + "–" + Math.min(state.page * size, rows.length) + " of " + rows.length + " · Page " + state.page + " of " + pages : "0 matching loaded instances");
    byId("previous").disabled = state.page <= 1; byId("next").disabled = state.page >= pages; byId("loadMore").hidden = !hasMore(); byId("overviewLoadMore").hidden = !hasMore(); byId("anomalyLoadMore").hidden = !hasMore(); text("overviewLoadMore", byId("loadMore").textContent); text("anomalyLoadMore", byId("loadMore").textContent);
    byId("evidence").innerHTML = loaded.map((scope) => '<h3>' + escapeHtml((scope.profile || "Default credentials") + " / " + scope.region) + '</h3><p class="muted small">' + scope.pages + ' AWS page(s) · ' + escapeHtml(scope.updatedAt) + '</p>' + scope.evidence.map((entry) => '<pre>' + escapeHtml(entry.service + '.' + entry.operation + ' · ' + entry.region + (entry.requestId ? ' · request ' + entry.requestId : '')) + '</pre>').join('')).join("");
    renderStopControl(); publishContext();
  }
  function showDetail(id, navigate = true) {
    if (navigate) { finishEdit(); returnToResults = viewQuery(); }
    if (state.busy) cancel();
    tagController?.abort(); state.selected = id;
    const row = state.records.get(id); if (!row) return;
    byId("profile").value = row.profile || "@default"; byId("region").value = row.region;
    byId("instanceDetail").hidden = false; text("detailTitle", instanceName(row));
    const fields = [["Instance name", instanceName(row)], ["Instance ID", row.instanceId], ["Reference rate / hour", money(row.pricing?.hourlyUsd ?? null)], ["Modeled compute / day · 24 h", money(monthly(row) === null ? null : monthly(row) / 730 * 24)], ["Modeled compute / month · 730 h", money(monthly(row))], ["Owner / user (tags)", ownerValues(row).join(", ") || (row.tags.length === row.tagCount ? "No owner tag" : "Owner unknown")], ["Account / profile", row.accountId + " / " + (row.profile || "Default credentials")], ["Region", row.region], ["Size", row.instanceType + " · " + (row.vcpu ?? "?") + " vCPU · " + (row.memoryGiB ?? "?") + " GiB"], ["OS", row.osVersion || row.platform || "Unknown"], ["Architecture / tenancy", (row.architecture || "Unknown") + " / " + (row.tenancy || "Unknown")], ["CPU platform", cpuCategory(row) + (row.cpuManufacturer ? " · " + row.cpuManufacturer : "")], ["GPU", row.gpu === null ? "Unknown" : row.gpu ? "GPU enabled" : "No GPU"], ["State", row.state], ["Launched", row.launchTime ? new Date(row.launchTime).toLocaleString() : "Unknown"], ["Price evidence", row.pricing ? "AWS Price List SKU " + row.pricing.sku + " · " + money(row.pricing.hourlyUsd) + "/hour" : "AWS pricing unavailable"]];
    byId("detailFields").innerHTML = fields.map(([label, value]) => '<div><span class="muted small">' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>').join("");
    requestedInstance = row.instanceId; renderTags(row); render(); if (navigate) commitView(); scrollWithinFrame(); byId("detailTitle").focus({ preventScroll: true });
  }
  function renderTags(row) {
    text("tagStatus", row.tags.length + " of " + row.tagCount + " reported tags loaded." + (row.tagsRetrievedAt ? " Updated " + new Date(row.tagsRetrievedAt).toLocaleString() + "." : ""));
    byId("allTags").hidden = row.tags.length >= row.tagCount;
    byId("tags").innerHTML = row.tags.map((tag) => '<dt>' + escapeHtml(tag.key) + '</dt><dd>' + escapeHtml(tag.value) + '</dd>').join("") || '<dt class="muted">No tags reported</dt><dd></dd>';
  }
  async function loadTags() {
    const row = state.records.get(state.selected); if (!row) return;
    renderTags(row);
    text("tagStatus", "All " + row.tagCount + " tags are included in this AWS SDK snapshot.");
  }
  function anomalyThresholds() {
    const tags = [...new Set(byId("requiredTags").value.split(",").map((value) => value.trim()).filter(Boolean))];
    byId("requiredTags").setCustomValidity(tags.length > 16 || tags.some((key) => key.length > 128) ? "Use at most 16 tag keys, each at most 128 characters." : "");
    if (!byId("anomalyForm").checkValidity()) return null;
    return { minMonthlyUsd: Number(byId("minMonthly").value), stoppedAgeDays: Number(byId("stoppedDays").value), requiredTags: tags };
  }
  function resetAnomalyAnalysis() {
    anomalyController?.abort(); anomalyController = null;
    if (state.anomaliesRunning) {
      state.anomaliesRunning = false; setBusy(false);
      finishProgress("Investigation canceled", "The inventory or settings changed. Run a new investigation for this view.");
    }
    state.anomalyReports = []; state.anomalyErrors = []; state.anomalyTargets = 0; state.selectedSignal = null;
    byId("anomalyAnalysis").hidden = true; byId("anomalyAnalysisResults").replaceChildren();
  }
  function visibleAnomalyFindings(report) { return report.findings.filter((finding) => byId("anomalyRule").value === "all" || finding.rules.includes(byId("anomalyRule").value)); }
  function renderAnomalies(rows) {
    const thresholds = anomalyThresholds();
    const findings = thresholds ? buildSignals(rows, thresholds) : null;
    state.anomalySignals = findings;
    byId("investigateAnomalies").disabled = state.busy || !findings || !visibleAnomalyFindings(findings).length;
    if (!findings) { text("anomalySummary", "Enter valid review thresholds."); byId("anomalyFindings").replaceChildren(); return; }
    const counts = (rule) => findings.findings.filter((finding) => finding.rules.includes(rule)).length;
    text("anomalySummary", visibleAnomalyFindings(findings).length + " shown / " + findings.findings.length + " instance(s) with review signals in current filters · " + counts("high_reference_cost") + " high estimated cost · " + counts("untagged") + " without tags · " + counts("aged_stopped") + " older stopped · " + counts("missing_required_tags") + " missing required tags.");
    text("anomalyCoverage", rows.length + " matching loaded instances. Checks unavailable: " + findings.coverage.unknownPrices + " running-instance prices, " + findings.coverage.incompleteTags + " incomplete tag lists, " + findings.coverage.unknownLaunchAge + " stopped-instance launch dates. Inventory page coverage is shown above.");
    const labels = { untagged: "Without tags", high_reference_cost: "High estimated cost", aged_stopped: "Stopped · older launch", missing_required_tags: "Missing required tags" };
    byId("anomalyFindings").innerHTML = visibleAnomalyFindings(findings).length ? visibleAnomalyFindings(findings).map((finding) => {
      const observations = [];
      if (finding.rules.includes("high_reference_cost")) observations.push("Current on-demand equivalent " + money(finding.monthlyUsd) + "/month meets the " + money(thresholds.minMonthlyUsd) + " review threshold. This is not measured billed spend.");
      if (finding.rules.includes("aged_stopped")) observations.push("Currently stopped; launched " + finding.launchAgeDays + " days before the inventory snapshot. Stop time and attached-storage charges have not been established.");
      if (finding.rules.includes("untagged")) observations.push("The complete reported tag list is empty. This instance has no tags.");
      if (finding.rules.includes("missing_required_tags")) observations.push("Complete reported tag list is missing: " + finding.missingTags.join(", ") + ".");
      return '<article class="panel signal-row"><div class="row signal-heading"><div><h3>' + escapeHtml(instanceName(state.records.get(finding.key) || finding)) + '</h3><p class="small muted">' + escapeHtml(finding.instanceId + " · " + finding.instanceType + " · " + (finding.profile || "Default credentials") + " / " + finding.region) + '</p></div><div>' + finding.rules.map((rule) => '<span class="rule-label">' + labels[rule] + '</span>').join("") + '</div></div><ul class="small">' + observations.map((item) => '<li>' + escapeHtml(item) + '</li>').join("") + '</ul><p class="small muted">Observed ' + escapeHtml(new Date(finding.observedAt).toLocaleString()) + '</p><div class="actions signal-actions"><button data-signal-instance="' + escapeHtml(finding.key) + '">View instance</button><button data-signal-ask="' + escapeHtml(finding.key) + '">Ask AWS about this signal</button></div></article>';
    }).join("") : '<div class="panel empty">No signals in this category for the matching loaded instances. Missing pages, prices, or tags can hide additional signals; no billing or idle-capacity conclusion is implied.</div>';
    renderAnomalyAnalysis();
  }
  function renderAnomalyAnalysis() {
    if (!state.anomalyReports.length && !state.anomalyErrors.length && !state.anomaliesRunning) return;
    byId("anomalyAnalysis").hidden = false;
    const reviewed = state.anomalyReports.reduce((sum, report) => sum + report.findings.length, 0);
    text("anomalyAnalysisStatus", (state.mock ? "Mock investigation · " : "") + (state.anomaliesRunning ? "Investigation in progress. " : "Investigation results. ") + "Agent reviewed " + reviewed + " of " + state.anomalyTargets + " requested instances; " + (state.anomalySignals ? visibleAnomalyFindings(state.anomalySignals).length : 0) + " signals exist in this view. At most five highest-ranked instances are investigated.");
    const list = (label, values) => values.length ? '<h4>' + label + '</h4><ul class="small">' + values.map((value) => '<li>' + escapeHtml(value) + '</li>').join("") + '</ul>' : "";
    byId("anomalyAnalysisResults").innerHTML = state.anomalyErrors.map((error) => '<p class="notice error">' + escapeHtml(error) + '</p>').join("") + state.anomalyReports.map((report) => '<h3>' + escapeHtml((report.profile || "Default credentials") + " / " + report.region) + '</h3><p>' + escapeHtml(report.summary) + '</p>' + list("Limitations", report.warnings) + report.findings.map((finding) => {
      const row = state.records.get(report.accountId + ":" + report.region + ":" + finding.instanceId);
      const name = instanceName(row);
      const heading = row ? '<a href="' + escapeHtml(instanceUrl(row).toString()) + '">' + escapeHtml(name) + '</a>' : escapeHtml(name);
      const count = finding.cpuDaily.length;
      const average = count ? finding.cpuDaily.reduce((sum, point) => sum + point.averagePercent, 0) / count : null;
      const maximum = count ? Math.max(...finding.cpuDaily.map((point) => point.maximumPercent)) : null;
      return '<article class="analysis-finding"><h3>' + heading + '</h3><p class="small muted">' + escapeHtml(finding.instanceId + (row ? ' · ' + row.instanceType : '')) + '</p><p class="small muted">CPU window: ' + escapeHtml(report.startDate + " to " + report.endExclusive) + ' (end exclusive) · UTC</p><p class="small cpu-summary">' + (count ? 'Mean of returned daily CPU averages: ' + average.toFixed(1) + '% · Maximum: ' + maximum.toFixed(1) + '% · ' + count + '/7 days reported.' : 'No CPU samples returned; utilization is unknown.') + (count && count < 5 ? ' CPU coverage is insufficient for a utilization conclusion.' : '') + '</p>' + list("Observations", finding.observations) + list("Possible causes · unconfirmed", finding.hypotheses) + list("Recommended checks", finding.nextSteps) + (count ? '<details><summary>Daily CPU evidence</summary><div class="table-wrap"><table><thead><tr><th>Date · UTC</th><th class="numeric">Average CPU · %</th><th class="numeric">Maximum CPU · %</th></tr></thead><tbody>' + [...finding.cpuDaily].sort((a, b) => a.date.localeCompare(b.date)).map((point) => '<tr><td>' + escapeHtml(point.date) + '</td><td class="numeric">' + point.averagePercent.toFixed(1) + '</td><td class="numeric">' + point.maximumPercent.toFixed(1) + '</td></tr>').join("") + '</tbody></table></div></details>' : '') + '</article>';
    }).join("") + '<details><summary>Agent-cited AWS MCP evidence</summary>' + report.evidence.map((entry) => '<pre>' + escapeHtml(entry.tool + " · " + entry.profile + " · " + entry.region + "\n" + entry.command) + '</pre>').join("") + '</details>').join("");
  }
  async function investigateAnomalies() {
    const thresholds = anomalyThresholds();
    if (!thresholds || !byId("anomalyForm").reportValidity() || state.busy) return;
    const report = buildSignals(matchingRows(), thresholds);
    const candidates = visibleAnomalyFindings(report).slice(0, 5);
    if (!candidates.length) return;
    resetAnomalyAnalysis();
    anomalyController = new AbortController(); const signal = anomalyController.signal;
    state.anomaliesRunning = true; state.anomalyTargets = candidates.length; setBusy(true);
    beginProgress("Investigating EC2 review signals…", "The AWS agent will verify current inventory and seven completed UTC days of CPU evidence for up to five selected instances.");
    renderAnomalyAnalysis();
    const groups = new Map();
    for (const candidate of candidates) { const id = candidate.profile + ":" + candidate.region; if (!groups.has(id)) groups.set(id, { profile: candidate.profile, region: candidate.region, candidates: [] }); groups.get(id).candidates.push({ instanceId: candidate.instanceId, rules: candidate.rules }); }
    const queue = [...groups.values()]; let completed = 0;
    const worker = async () => {
      while (queue.length && !signal.aborted) {
        const input = queue.shift();
        try {
          const plan = await requestPlan({ kind: "anomalies", thresholds, ...input }, signal);
          const result = await invokeAgenticApp({ agentId: plan.agentId, appId: "ec2", title: "EC2 anomaly investigation", message: plan.prompt, signal, clientContext: { dashboardKind: "ec2-anomalies", scope: plan.scope, requestId: plan.requestId, range: plan.range, instanceIds: plan.instanceIds, metricCommands: plan.metricCommands, inventoryCommand: plan.command, response_format: plan.responseFormat }, onProgress: (phase) => {
            if (signal.aborted) return;
            text("progressDetail", (phase === "creating_conversation" ? "Creating an authorized investigation conversation" : phase === "invoking_agent" ? "Waiting for AWS MCP and CloudWatch evidence" : "Validating the agent investigation") + " · " + (input.profile || "Default credentials") + " / " + input.region + " · " + completed + "/" + groups.size + " scopes completed. Individual tool progress is unavailable.");
          } });
          if (signal.aborted) return;
          if (result.structured_output_schema_id && result.structured_output_schema_id !== plan.responseFormat.schema_id) throw new Error("The investigation returned a different response format.");
          state.anomalyReports.push(validateInvestigation(result.structured_output ?? result.content, plan)); state.mock ||= result.mock === true;
        } catch (error) { if (signal.aborted) return; state.anomalyErrors.push((input.profile || "Default credentials") + " / " + input.region + ": " + error.message); }
        completed += 1; renderAnomalyAnalysis();
      }
    };
    await Promise.all([worker(), worker()]);
    if (signal.aborted) return;
    state.anomaliesRunning = false; setBusy(false); render();
    finishProgress(state.anomalyErrors.length ? "Investigation completed with unavailable evidence" : "Agent investigation complete", "Reviewed " + state.anomalyReports.reduce((sum, result) => sum + result.findings.length, 0) + " of " + candidates.length + " requested instances. Review observations, CPU coverage, and limitations below.");
  }
  async function stopRequest(input) {
    const response = await fetch(route("/api/stop-request"), { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    return (await readAgenticAppJsonResponse(response, "Instance stop request failed")).data;
  }
  function renderStopControl() {
    const row = state.records.get(state.selected);
    byId("stopInstance").hidden = !stopCapability.allowed || !row || !stopCapability.profiles.includes(row.profile) || row.state !== "running";
    byId("stopInstance").disabled = state.busy || stopExecuting;
  }
  async function loadStopCapability() {
    try {
      const response = await fetch(route("/api/stop-capability"), { credentials: "same-origin" });
      const result = await readAgenticAppJsonResponse(response, "Stop capability unavailable");
      if (result.data?.allowed === true && Array.isArray(result.data.profiles)) stopCapability = result.data;
    } catch { stopCapability = { allowed: false, profiles: [] }; console.warn("[ec2] Stop capability unavailable; action remains disabled."); }
    renderStopControl();
  }
  async function openStopConfirmation() {
    const row = state.records.get(state.selected);
    if (!row || !stopCapability.allowed || stopExecuting) return;
    const version = ++stopDialogVersion;
    stopApproval = null; stopOutcome = ""; byId("stopConfirmation").value = ""; byId("stopConfirmation").disabled = false;
    byId("confirmStop").disabled = true; byId("confirmStop").hidden = false;
    byId("checkStopStatus").hidden = true; byId("cancelStop").disabled = false; text("cancelStop", "Cancel");
    text("stopTarget", instanceName(row) + " · " + row.instanceId + " · " + row.profile + " / " + row.accountId + " / " + row.region);
    text("stopStatus", "Verifying the live instance before confirmation…"); byId("stopSpinner").hidden = false; byId("stopDialog").showModal();
    try {
      const approval = await stopRequest({ kind: "prepare", profile: row.profile, region: row.region, instanceId: row.instanceId });
      if (version !== stopDialogVersion || !byId("stopDialog").open) return;
      if (approval.target?.instanceId !== row.instanceId || approval.target.accountId !== row.accountId || approval.target.region !== row.region || approval.target.profile !== row.profile) throw new Error("The confirmation target changed. Close and review the instance again.");
      stopApproval = approval;
      byId("stopTarget").innerHTML = '<strong>' + escapeHtml(approval.target.name) + '</strong><span>' + escapeHtml(row.instanceId) + '</span><span>' + escapeHtml(row.profile + " · " + row.accountId + " · " + row.region) + '</span><span>' + escapeHtml(approval.target.instanceType + " · " + approval.target.state) + '</span>';
      text("stopStatus", "Review this instance, then type its exact ID to enable Confirm stop.");
    } catch (error) { if (version === stopDialogVersion) text("stopStatus", error.message); }
    finally { if (version === stopDialogVersion) byId("stopSpinner").hidden = true; }
  }
  async function checkLiveStopStatus() {
    if (!stopApproval) return null;
    const target = stopApproval.target; const version = stopDialogVersion;
    const data = await stopRequest({ kind: "status", profile: target.profile, region: target.region, instanceId: target.instanceId });
    validateResponse(data, { scope: target, cacheTtlMs: configuration.cacheTtlMs, cacheMaxStaleMs: configuration.cacheMaxStaleMs });
    const row = data.instances.find((r) => r.instanceId === target.instanceId);
    if (!row) throw new Error("Live instance state is unavailable.");
    state.records.set(key(row), row); render();
    if (version !== stopDialogVersion) return row.state;
    text("stopStatus", stopOutcome + (row.state === "stopped" ? "Stopped. Confirmed from live AWS inventory." : "Live instance state: " + row.state + ". A stop request is not a stopped-state confirmation."));
    return row.state;
  }
  async function executeConfirmedStop() {
    if (!stopApproval || stopExecuting || byId("stopConfirmation").value !== stopApproval.target.instanceId) return;
    if (Date.parse(stopApproval.expiresAt) <= Date.now()) { text("stopStatus", "Confirmation expired. Close and review the instance again."); byId("confirmStop").disabled = true; return; }
    stopExecuting = true; byId("confirmStop").disabled = true; byId("stopConfirmation").disabled = true; byId("cancelStop").disabled = true; byId("stopSpinner").hidden = false;
    let accepted = false; let dispatched = false;
    text("stopStatus", "Rechecking the confirmed instance before submitting the stop…");
    try {
      const plan = await stopRequest({ kind: "confirm", requestId: stopApproval.requestId, confirmation: byId("stopConfirmation").value });
      dispatched = true;
      const result = await invokeAgenticApp({ agentId: plan.agentId, appId: "ec2", title: "Confirmed EC2 instance stop", message: plan.prompt, clientContext: { dashboardKind: "ec2-stop", scope: plan.scope, requestId: plan.requestId, command: plan.command, describeCommand: plan.describeCommand, response_format: plan.responseFormat }, onProgress: () => text("stopStatus", "Submitting the confirmed normal stop through the AWS agent. IAM authorization is required…") });
      if (result.structured_output_schema_id && result.structured_output_schema_id !== plan.responseFormat.schema_id) throw new Error("Stop response format is unverified. Check live status.");
      const response = validateStopResponse(result.structured_output ?? result.content, plan);
      accepted = response.status === "accepted";
      stopOutcome = accepted ? "Stop request accepted. " : (response.status === "denied" ? "Stop denied: " : "Stop outcome unverified: ") + response.message + " ";
      text("stopStatus", stopOutcome + "Checking live state…");
    } catch (error) { stopOutcome = (dispatched ? "Stop response unverified: " : "Stop request was not submitted: ") + error.message + " "; text("stopStatus", stopOutcome + "Check live status before requesting another stop."); }
    finally {
      byId("confirmStop").hidden = true; byId("checkStopStatus").hidden = false;
      try {
        let current = await checkLiveStopStatus();
        for (let attempt = 0; accepted && current === "stopping" && attempt < 11; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          current = await checkLiveStopStatus();
        }
      } catch (error) { text("stopStatus", "Live status could not be verified: " + error.message + " Use Check live status; the stop will not be retried automatically."); }
      stopExecuting = false; byId("stopSpinner").hidden = true; byId("cancelStop").disabled = false; text("cancelStop", "Close"); renderStopControl();
    }
  }
  byId("stopInstance").addEventListener("click", openStopConfirmation);
  byId("stopConfirmation").addEventListener("input", () => { byId("confirmStop").disabled = !stopApproval || stopExecuting || byId("stopConfirmation").value !== stopApproval.target.instanceId || Date.parse(stopApproval.expiresAt) <= Date.now(); });
  byId("confirmStop").addEventListener("click", executeConfirmedStop);
  byId("cancelStop").addEventListener("click", () => { if (!stopExecuting) byId("stopDialog").close(); });
  byId("stopDialog").addEventListener("cancel", (event) => { if (stopExecuting) event.preventDefault(); });
  byId("stopDialog").addEventListener("close", () => { stopDialogVersion++; stopApproval = null; });
  byId("checkStopStatus").addEventListener("click", async () => {
    if (stopExecuting) return;
    byId("checkStopStatus").disabled = true;
    try { await checkLiveStopStatus(); } catch (error) { text("stopStatus", "Live status could not be verified: " + error.message); }
    finally { byId("checkStopStatus").disabled = false; }
  });
  function publishContext() {
    const selected = state.records.get(state.selected);
    const selection = { requestedScope: { profile: byId("profile").value === "@default" ? "" : byId("profile").value, region: byId("region").value }, configuredAccounts: configuration.accounts.slice(0, 12), configuredRegions: configuration.regions.slice(0, 12), scopeCount: state.scopes.size, scopes: [...state.scopes.values()].slice(0, 12).map((scope) => ({ profile: scope.profile, accountId: scope.accountId, region: scope.region, status: scope.status, morePages: Boolean(scope.nextToken) })), activeTab: state.activeTab, reviewSignalSettings: anomalyThresholds(), selectedReviewSignal: state.selectedSignal || null, filters: state.activeTab === "search" ? { search: byId("quickSearch").value.slice(0, 256), searchIn: "all" } : { instanceType: byId("typeFilter").value, size: byId("sizeFilter").value, owner: byId("ownerFilter").value, tags: byId("tagQuery").value, tagStatus: byId("tagStatusFilter").value, minMonthlyCost: byId("minCost").value, maxMonthlyCost: byId("maxCost").value, anomalyRule: byId("anomalyRule").value, hardware: state.activeTab === "gpu" ? "gpu" : byId("hardwareFilter").value, searchIn: byId("searchIn").value, search: byId("search").value.slice(0, 256), state: byId("stateFilter").value }, loadedInstances: state.records.size, selectedInstance: selected ? { name: instanceName(selected), instanceId: selected.instanceId, profile: selected.profile, accountId: selected.accountId, region: selected.region, instanceType: selected.instanceType, architecture: selected.architecture, cpuManufacturer: selected.cpuManufacturer, gpu: selected.gpu, state: selected.state } : null, mock: state.mock };
    window.parent?.postMessage({ type: "caipe.agenticApp.context.v1", version: "1.0", appId: "ec2", context: { route: appPath, title: "EC2 instances", agentId: configuration.agentId, mcpServerId: "mcp-aws", domainAnswersRequireMcp: true, summary: "AWS SDK EC2 inventory for the selected AWS profiles and regions. " + state.records.size + " instances fetched. Pricing is an on-demand reference estimate, not billed cost.", selection: JSON.stringify(selection), resourceRefs: [{ kind: "agent", id: configuration.agentId }, { kind: "mcp-server", id: "mcp-aws" }], suggestedPrompts: selected ? ["Use AWS MCP to show all tags and OS details for the selected instance in this dashboard.", "Compare current pricing and actual billing evidence for this instance, stating unavailable data."] : ["Which instances in the selected account scope should I investigate for cost savings?", "Compare instance sizes and OS versions using current AWS evidence."] } }, window.location.origin);
  }
  function openAssistant() { publishContext(); if (window.parent === window) { text("assistantStatus", "Ask AWS is available inside the platform host, using the dedicated EC2 agent and AWS MCP."); return; } window.parent?.postMessage({ type: "caipe.agenticApp.assistant.open.v1", version: "1.0", appId: "ec2" }, window.location.origin); text("assistantStatus", "Opened Ask AWS with the selected account, region, and instance context."); }
  for (const name of tabNames) {
    byId(name + "Tab").addEventListener("click", () => activateTab(name, false, true));
    byId(name + "Tab").addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = tabNames.indexOf(name);
      activateTab(event.key === "Home" ? tabNames[0] : event.key === "End" ? tabNames.at(-1) : tabNames[(index + (event.key === "ArrowRight" ? 1 : -1) + tabNames.length) % tabNames.length], true, true);
    });
  }
  byId("anomalyForm").addEventListener("submit", (event) => { event.preventDefault(); investigateAnomalies(); });
  byId("anomalyForm").addEventListener("input", (event) => { resetAnomalyAnalysis(); render(); if (event.target.tagName === "SELECT") commitView(); else textChanged(event.target.id); });
  byId("anomalyFindings").addEventListener("click", (event) => {
    const view = event.target.closest("button[data-signal-instance]");
    const ask = event.target.closest("button[data-signal-ask]");
    const id = view?.dataset.signalInstance || ask?.dataset.signalAsk;
    if (!id || state.busy) return;
    const finding = state.anomalySignals?.findings.find((item) => item.key === id);
    if (!finding) return;
    state.selectedSignal = { name: instanceName(state.records.get(id) || finding), instanceId: finding.instanceId, profile: finding.profile, region: finding.region, rules: finding.rules, referenceMonthlyUsd: finding.monthlyUsd, launchAgeDays: finding.launchAgeDays, missingTags: finding.missingTags };
    if (view) { const previous = viewQuery(); activateTab("instances"); showDetail(id); returnToResults = previous; } else { state.selected = id; openAssistant(); }
  });
  byId("quickSearchForm").addEventListener("submit", (event) => { event.preventDefault(); finishEdit(); render(); });
  byId("quickSearch").addEventListener("input", () => { renderQuickSearch([...state.scopes.values()]); publishContext(); textChanged("quickSearch"); });
  byId("quickResults").addEventListener("click", (event) => {
    const link = event.target.closest("a[data-quick-instance]");
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button) return;
    event.preventDefault(); const row = state.records.get(link.dataset.quickInstance); if (!row) return;
    finishEdit(); const previous = viewQuery(); clearInventoryFilters(); activateTab("instances"); showDetail(link.dataset.quickInstance); returnToResults = previous;
  });
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link || link.dataset.quickInstance || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button || link.target === "_blank") return;
    const url = new URL(link.href, location.origin);
    if (url.origin !== location.origin || url.pathname !== new URL(appPath, location.origin).pathname || !url.searchParams.has("instanceId")) return;
    event.preventDefault(); finishEdit(); const previous = viewQuery();
    navigation.commit(url.searchParams.toString()); restoreView(url.search); returnToResults = previous;
  });
  byId("allSearchResults").addEventListener("click", () => { finishEdit(); clearInventoryFilters(); byId("search").value = byId("quickSearch").value; activateTab("instances"); commitView(); scrollWithinFrame(); });
  byId("scopeForm").addEventListener("submit", (event) => { event.preventDefault(); finishEdit(); requestedInstance = ""; commitView(); loadInventory(); });
  byId("searchAll").addEventListener("click", () => { if (configuration.accounts.length > 1) byId("profile").value = "*"; if (configuration.regions.length > 1) byId("region").value = "*"; requestedInstance = ""; state.selected = null; commitView(); loadInventory(); });
  for (const id of ["profile", "region"]) byId(id).addEventListener("change", () => { if (state.busy) cancel(); requestedInstance = ""; state.selected = null; commitView(); loadInventory(); });
  byId("refresh").addEventListener("click", () => loadInventory(false, true)); byId("loadMore").addEventListener("click", () => loadInventory(true)); byId("overviewLoadMore").addEventListener("click", () => loadInventory(true)); byId("anomalyLoadMore").addEventListener("click", () => loadInventory(true)); byId("cancel").addEventListener("click", cancel);
  byId("filterForm").addEventListener("submit", (event) => event.preventDefault());
  for (const id of ["search", "searchIn", "stateFilter", "hardwareFilter", "typeFilter", "sizeFilter", "ownerFilter", "tagStatusFilter", "tagQuery", "minCost", "maxCost", "sort", "pageSize"]) byId(id).addEventListener(["search", "tagQuery", "minCost", "maxCost"].includes(id) ? "input" : "change", () => { resetAnomalyAnalysis(); state.page = 1; if (!["sort", "pageSize"].includes(id)) { state.selected = null; byId("instanceDetail").hidden = true; } requestedInstance = ""; render(); if (["search", "tagQuery", "minCost", "maxCost"].includes(id)) textChanged(id); else commitView(); });
  function clearInventoryFilters() {
    resetAnomalyAnalysis(); state.page = 1; state.selected = null; byId("instanceDetail").hidden = true;
    for (const id of ["search", "tagQuery", "typeFilter", "sizeFilter", "ownerFilter", "minCost", "maxCost"]) byId(id).value = "";
    for (const id of ["searchIn", "stateFilter", "hardwareFilter", "tagStatusFilter", "anomalyRule"]) byId(id).value = "all";
    byId("sort").value = "cost"; byId("maxCost").setCustomValidity(""); render();
  }
  byId("clearFilters").addEventListener("click", () => { requestedInstance = ""; clearInventoryFilters(); commitView(); });
  byId("previous").addEventListener("click", () => { state.page -= 1; render(); commitView(); }); byId("next").addEventListener("click", () => { state.page += 1; render(); commitView(); });
  byId("instanceRows").addEventListener("click", (event) => { const button = event.target.closest("button[data-instance]"); if (button) showDetail(button.dataset.instance); });
  byId("allTags").addEventListener("click", loadTags); byId("closeDetail").addEventListener("click", () => {
    const target = returnToResults || new URLSearchParams({ tab: "instances", profile: byId("profile").value, region: byId("region").value }).toString();
    returnToResults = null; navigation.commit(target, "replace"); restoreView("?" + target);
  });
  for (const id of ["quickSearch", "search", "tagQuery", "minCost", "maxCost", "minMonthly", "stoppedDays", "requiredTags"]) byId(id).addEventListener("blur", finishEdit);

  byId("askAws").addEventListener("click", openAssistant); byId("askInstance").addEventListener("click", openAssistant);
  byId("copyLink").addEventListener("click", async () => {
    finishEdit(); const url = new URL(appPath, location.origin); const selected = state.records.get(state.selected);
    url.search = viewQuery();
    try { await navigator.clipboard.writeText(url.toString()); text("status", (selected ? "Link copied for " + instanceName(selected) + "." : "View link copied.") + " The instance or search loads automatically; recipients need their own app access."); } catch { text("status", "Share this view: " + url.toString()); }
  });
  async function pollCacheStatus() {
    let delay = 60_000;
    try {
      const response = await fetch(route("/api/cache-status"), { credentials: "same-origin" });
      const result = await readAgenticAppJsonResponse(response, "Cache status unavailable"); const cache = result.data;
      const next = cache.nextRefreshAt ? new Date(cache.nextRefreshAt).toLocaleString() : "not scheduled";
      const updated = cache.completedAt ? new Date(cache.completedAt).toLocaleString() : "warming for the first time";
      text("cacheStatus", cache.enabled === false ? "Background refresh is disabled. Reload cached view retrieves the current snapshots." : cache.refreshing ? "Background cache refresh: " + cache.completedScopes + "/" + cache.totalScopes + " scopes completed. Existing snapshots remain available." : "Last background refresh: " + updated + " · Next refresh: " + next + (cache.failures.length ? " · " + cache.failures.length + " failed scope(s); last snapshots are retained where available." : ""));
      if (cache.completedAt && lastBackgroundRefresh && cache.completedAt !== lastBackgroundRefresh && state.hasSnapshot && !state.busy && !state.selected && !state.anomalyReports.length) void loadInventory();
      if (cache.completedAt) lastBackgroundRefresh = cache.completedAt;
      delay = cache.refreshing ? 5000 : Math.min(300_000, Math.max(10_000, Date.parse(cache.nextRefreshAt) - Date.now() || 300_000));
    } catch (error) { text("cacheStatus", "Background cache status unavailable: " + error.message); }
    if (!cachePollingStopped) cachePollTimer = setTimeout(pollCacheStatus, delay);
  }
  window.addEventListener("pagehide", () => { cachePollingStopped = true; clearTimeout(cachePollTimer); });
  window.addEventListener("pageshow", (event) => { if (event.persisted) { cachePollingStopped = false; void pollCacheStatus(); } });
  window.addEventListener("caipe:microfrontend-initialize", publishContext);
  applyQuery(location.search);
  navigation = createNavigation({ appId: "ec2", appPath, restore: restoreView });
  publishContext();
  if (invalidLink) { text("status", "This link has an invalid instance, scope, or filter setting. Choose a configured scope to search."); text("quickSearchStatus", "This link has an invalid setting. Open Instances to choose a configured scope and search."); }
  else loadInventory(false, false, Boolean(requestedInstance), true);
  void pollCacheStatus();
  if (configuration.stopEnabled) void loadStopCapability();
}
