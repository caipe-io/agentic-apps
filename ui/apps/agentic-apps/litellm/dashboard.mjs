import { estimateModelRequestCost } from "./model-info.mjs";
import { renderMicrofrontendClient } from "../../_lib/microfrontend-client.mjs";

export function renderLiteLlmDashboard({ compact, basePath, appPath, agentId }) {
  const config = JSON.stringify({ basePath, appPath, agentId }).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LiteLLM Usage Dashboard</title>
  <style>
    :root { color-scheme: dark; --app-font-scale: 1; font: calc(15px * var(--app-font-scale))/1.5 Inter, ui-sans-serif, system-ui, sans-serif; color: #e2e8f0; background: #080e1a; --surface: #101a2b; --text: #e2e8f0; --muted: #a2b3cc; --line: #293951; --track: #22314a; --series: #67e8f9; --output: #a5b4fc; --warning: #fcd34d; --error: #fecaca; }
    :root[data-caipe-theme="light"] { color-scheme: light; color: #15233a; background: #f7f9fc; --surface: #fff; --text: #15233a; --muted: #50627b; --line: #dce3ed; --track: #e3eaf1; --series: #087a83; --output: #6056b4; --warning: #925705; --error: #a82323; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { width: min(1280px, calc(100% - 40px)); margin: auto; padding: 28px 0 42px; }
    h1, h2, p { margin: 0; } h1 { font-size: 1.85rem; letter-spacing: -.03em; font-weight: 650; } h2 { font-size: 1.12rem; font-weight: 600; }
    .muted, small { color: var(--muted); } .small, small { font-size: .82rem; }
    .heading, .panel-heading, .pagination, .selection { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .heading { margin-bottom: 22px; } .subtitle { color: var(--muted); margin-top: 5px; max-width: 760px; }
    .actions, .controls { display: flex; align-items: end; gap: 12px; flex-wrap: wrap; } .controls { margin: 16px 0 12px; }
    label { display: grid; gap: 5px; color: var(--muted); font-size: .82rem; }
    .search-field { flex: 1; min-width: min(260px, 100%); }
    input, select, button { font: inherit; min-height: 40px; padding: 8px 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--text); max-width: 100%; }
    input { width: 100%; } button { cursor: pointer; } button:hover:not(:disabled) { border-color: var(--series); } button:disabled { opacity: .5; cursor: default; }
    :is(input, select, button, a):focus-visible { outline: 2px solid var(--series); outline-offset: 3px; }
    .button-link { padding: 8px 11px; border: 1px solid var(--line); border-radius: 8px; text-decoration: none; min-height: 40px; display: inline-flex; align-items: center; }
    .primary { background: var(--series); border-color: var(--series); color: #081a22; font-weight: 600; } :root[data-caipe-theme="light"] .primary { color: #fff; }
    .panel { border: 1px solid var(--line); background: var(--surface); border-radius: 12px; padding: 20px; min-width: 0; }
    .catalog { margin-bottom: 24px; } .panel-heading { margin-bottom: 8px; } .catalog-note { margin-bottom: 12px; }
    .table-wrap { overflow: auto; } table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    th, td { padding: 11px 10px; border-bottom: 1px solid var(--line); vertical-align: middle; } th { color: var(--muted); font-weight: 500; text-align: left; font-size: .8rem; }
    td:first-child { min-width: 150px; overflow-wrap: anywhere; } td .owner, th .owner { display: block; color: var(--muted); font-size: .8rem; }
    .numeric { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .spend-cell { min-width: 180px; } .spend-track { height: 6px; background: var(--track); margin-top: 6px; border-radius: 6px; overflow: hidden; } .spend-track i { display: block; height: 100%; background: var(--series); }
    .key-choice { white-space: nowrap; } .key-choice[aria-pressed="true"] { border-color: var(--series); color: var(--series); }
    .directory { margin-top: 14px; } .directory > summary { color: var(--text); } .directory[open] > summary { margin-bottom: 14px; }
    .pagination { margin-top: 14px; } .pagination .actions { align-items: center; } .pagination label { display: flex; align-items: center; gap: 8px; }
    .selection { margin-bottom: 16px; } .selection h2 { font-size: 1.3rem; overflow-wrap: anywhere; } .selection .controls { margin: 0; }
    .kpis { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; margin: 16px 0; } .kpi { padding: 16px 20px; } .kpi strong { display: block; font-size: 1.7rem; font-weight: 600; font-variant-numeric: tabular-nums; }
    .layout { display: grid; grid-template-columns: minmax(0,1.5fr) minmax(280px,1fr); gap: 16px; margin-bottom: 16px; }
    .chart { width: 100%; height: 240px; display: block; margin-top: 12px; }
    .budget-value { font-size: 2.2rem; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 12px; }
    .budget-track { height: 12px; background: var(--track); border-radius: 8px; overflow: hidden; margin: 18px 0 8px; } .budget-track i { display: block; height: 100%; background: var(--series); } .budget-track.over i { background: var(--warning); }
    .budget-meta { display: grid; gap: 6px; margin-top: 12px; font-size: .85rem; color: var(--muted); }
    .model-bars { display: grid; gap: 15px; margin-top: 20px; } .model-bar { display: grid; grid-template-columns: minmax(120px,1fr) minmax(80px,2fr) auto; gap: 16px; align-items: center; font-size: .88rem; }
    .model-label { overflow-wrap: anywhere; } .model-track { height: 14px; background: var(--track); border-radius: 5px; overflow: hidden; } .model-track i { height: 100%; display: block; background: var(--series); } .model-value { font-variant-numeric: tabular-nums; text-align: right; }
    .model-details { margin-top: 20px; } .available-models { margin-top: 20px; } .available-table { min-width: 850px; } .provisioning-meta { margin: 14px 0; overflow-wrap: anywhere; } .token-input { width: 150px; } .selection p, .budget-meta { overflow-wrap: anywhere; } details { margin-top: 12px; } summary { cursor: pointer; color: var(--muted); } .detail-table { min-width: 680px; }
    .empty { padding: 26px 12px; color: var(--muted); text-align: center; } .notice { color: var(--muted); margin: 10px 0; } .notice.error { color: var(--error); } .warning { color: var(--warning); margin-top: 10px; }
    .freshness { color: var(--muted); font-size: .8rem; margin: 16px 0 0; } footer { color: var(--muted); font-size: .8rem; margin-top: 22px; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; } a { color: var(--series); }
    [hidden] { display: none !important; } body.compact main { padding-top: 18px; } body.compact .panel { padding: 16px; }
    @media (max-width: 850px) { .layout { grid-template-columns: 1fr; } }
    @media (max-width: 580px) { main { width: calc(100% - 24px); } .heading .actions { width: 100%; } .controls > label { flex: 1; } .kpis { grid-template-columns: 1fr; } .selection > * { width: 100%; } .model-bar { grid-template-columns: 1fr auto; gap: 5px 12px; } .model-track { grid-column: 1 / -1; grid-row: 2; } .pagination { align-items: start; } }
    @media (pointer: coarse) { button, select, input { min-height: 44px; } }
  </style>
</head>
<body class="${compact ? "compact" : ""}">
<main>
  <header class="heading">
    <div><h1>LLM usage &amp; budgets</h1><p class="subtitle">Find your virtual key, track your balance, and see which models drive usage.</p></div>
    <div class="actions"><a href="#availableModels" class="button-link">Compare models</a><button id="refresh" disabled>Refresh data</button><button id="openAssistant" class="primary">Ask LiteLLM</button></div>
  </header>
  <section class="panel catalog" aria-labelledby="usersTitle" aria-busy="true" id="catalog">
    <div class="panel-heading"><h2 id="usersTitle">Users &amp; virtual keys</h2><span id="catalogCount" class="muted small" role="status" aria-live="polite">Loading keys…</span></div>
    <div class="controls">
      <label class="search-field">Search users or keys<input id="userSearch" type="search" placeholder="Username, email, or key name" autocomplete="off" /></label>
      <label>Sort by<select id="keySort"><option value="spend">Highest spend</option><option value="spend-asc">Lowest spend</option><option value="name">Username A–Z</option></select></label>
    </div>
    <details id="keyDirectory" class="directory"><summary>Browse key spend ranking</summary>
    <p class="muted small catalog-note">One row per virtual key. Key spend covers its current budget cycle or lifetime and is independent of the usage period below.</p>
    <div class="table-wrap"><table aria-label="Virtual-key spend ranking"><thead><tr><th scope="col">User / key</th><th scope="col" class="numeric">Key spend</th><th scope="col" class="numeric">Budget remaining</th><th scope="col">Usage</th></tr></thead><tbody id="keyRows"><tr><td colspan="4" class="empty">Loading virtual keys…</td></tr></tbody></table></div>
    <nav class="pagination" aria-label="Virtual-key pages"><span id="pageInfo" class="muted small"></span><div class="actions"><label>Rows<select id="pageSize"><option>10</option><option>25</option><option>50</option></select></label><button id="previousPage" disabled>Previous</button><button id="nextPage" disabled>Next</button></div></nav>
    </details>
    <p id="catalogStatus" class="notice small" role="status" aria-live="polite"></p>
  </section>
  <section aria-labelledby="selectedTitle" id="usageSection">
    <div class="selection"><div><h2 id="selectedTitle">Select a user or virtual key</h2><p id="selectedOwner" class="muted small"></p></div><label>Usage period<select id="period"><option value="current">Today</option><option value="month" selected>Current month</option><option value="3m">Last 3 months</option><option value="6m">Last 6 months</option><option value="12m">Last 12 months</option></select></label></div>
    <p id="reportStatus" class="notice" role="status" aria-live="polite">Usage will load after the key list is ready.</p>
    <div id="reportContent" hidden>
      <p id="rangeLabel" class="muted small"></p>
      <section class="kpis" aria-label="Usage in selected period"><article class="panel kpi"><span class="muted small">Period spend</span><strong id="spend">—</strong><small>USD in selected period</small></article><article class="panel kpi"><span class="muted small">Total tokens</span><strong id="tokens">—</strong><small id="tokenSplit">Input and output</small></article><article class="panel kpi"><span class="muted small">Requests</span><strong id="requests">—</strong><small>Reported API requests</small></article></section>
      <div class="layout">
        <section class="panel" aria-labelledby="trendTitle"><div class="panel-heading"><h2 id="trendTitle">Usage trend</h2><label>Chart measure<select id="trendMetric"><option value="spend">Spend · USD</option><option value="totalTokens">Tokens</option><option value="requests">Requests</option></select></label></div><div id="trendEmpty" class="empty" hidden></div><svg id="trendChart" class="chart" role="img" aria-label="Usage by date"></svg><details><summary>View trend data</summary><div class="table-wrap"><table aria-label="Usage by date"><thead><tr><th scope="col">Date (UTC)</th><th scope="col" class="numeric">Spend</th><th scope="col" class="numeric">Tokens</th><th scope="col" class="numeric">Requests</th></tr></thead><tbody id="trendRows"></tbody></table></div></details></section>
        <section class="panel" aria-labelledby="budgetTitle"><h2 id="budgetTitle">Virtual-key budget</h2><p class="muted small" id="budgetSubtitle">Budget cycle / lifetime</p><div id="budgetRemaining" class="budget-value">—</div><p id="remainingLabel" class="muted small">Remaining</p><div id="budgetTrack" class="budget-track"><i id="budgetBar"></i></div><p id="budgetSummary" class="small"></p><div id="budgetMeta" class="budget-meta"></div></section>
      </div>
      <section class="panel" aria-labelledby="modelsTitle"><div class="panel-heading"><h2 id="modelsTitle">Most-used models</h2><label>Rank models by<select id="modelMetric"><option value="totalTokens">Tokens</option><option value="requests">Requests</option><option value="spend">Spend · USD</option></select></label></div><p id="modelSummary" class="muted small"></p><div id="modelBars" class="model-bars" role="list" aria-label="Top models"></div><details class="model-details"><summary>View model details</summary><div class="table-wrap"><table class="detail-table" aria-label="Model usage details"><thead><tr><th scope="col">Model</th><th scope="col" class="numeric">Spend</th><th scope="col" class="numeric">Input tokens</th><th scope="col" class="numeric">Output tokens</th><th scope="col" class="numeric">Requests</th><th scope="col" class="numeric">Spend share</th></tr></thead><tbody id="modelRows"></tbody></table></div></details></section>
      <p id="warnings" class="warning small" role="status" hidden></p><p id="freshness" class="freshness"></p>
    </div>
    <section class="panel available-models" id="availableModels" aria-labelledby="availableModelsTitle" hidden>
      <div class="panel-heading"><h2 id="availableModelsTitle">Available models &amp; price comparison</h2><span id="availableModelCount" class="muted small"></span></div>
      <p id="provisioningSummary" class="provisioning-meta small"></p>
      <details><summary>View key provisioning</summary><div id="provisioningDetails" class="budget-meta"></div></details>
      <p class="muted small">Key matches describe declared configuration. Team, owner, organization, access-group, and runtime policies can further restrict calls.</p>
      <div class="controls">
        <label class="search-field">Search available models<input id="modelSearch" type="search" placeholder="Model name or provider" autocomplete="off" /></label>
        <label>Show<select id="modelScope"><option value="all">All configured models</option><option value="listed">Matching key list</option></select></label>
        <label>Sort models by<select id="catalogModelSort"><option value="estimate">Lowest estimated cost</option><option value="input">Lowest input price</option><option value="output">Lowest output price</option><option value="name">Model name A–Z</option></select></label>
      </div>
      <div class="controls">
        <label>Input tokens per request<input class="token-input" id="estimateInput" type="number" value="1000" min="0" max="1000000000" step="1" inputmode="numeric" /></label>
        <label>Output tokens per request<input class="token-input" id="estimateOutput" type="number" value="1000" min="0" max="1000000000" step="1" inputmode="numeric" /></label>
      </div>
      <p class="muted small">One row per deployment; model aliases may route to several deployments. Prices: USD per 1M text tokens from this LiteLLM deployment. Estimates exclude cache discounts, long-context tiers, service tiers, and non-token charges. Missing rates are not treated as free.</p>
      <p id="availableModelsStatus" class="notice small" role="status" aria-live="polite"></p>
      <div class="table-wrap"><table class="available-table" aria-label="Configured model prices and key provisioning"><thead><tr><th scope="col">Model / provider</th><th scope="col">Mode</th><th scope="col">Key configuration</th><th scope="col" class="numeric">Input / 1M</th><th scope="col" class="numeric">Output / 1M</th><th scope="col" class="numeric">Estimated request</th></tr></thead><tbody id="availableModelRows"></tbody></table></div>
      <nav class="pagination" aria-label="Available-model pages"><span id="modelPageInfo" class="muted small"></span><div class="actions"><button id="previousModelPage" disabled>Previous models</button><button id="nextModelPage" disabled>Next models</button></div></nav>
      <p id="modelPricesFreshness" class="freshness"></p>
    </section>
  </section>
  <footer><span>Usage dates are in UTC. Budgets follow each key’s configured reset period.</span><a href="${escapeHtml(basePath)}/example">View static example</a></footer>
</main>
${renderMicrofrontendClient("litellm")}
<script>(${initializeLiteLlmDashboard.toString()})(${config}, ${estimateModelRequestCost.toString()});</script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

/** Browser entry point: serialized into the page so chart and request state stay together. */
function initializeLiteLlmDashboard({ basePath, appPath, agentId }, estimateModelRequestCost) {
  const byId = (id) => document.getElementById(id);
  const state = { report: null, keys: [], selectedKey: null, modelCatalog: null, modelPage: 1, page: 1, pagination: null, maxSpend: 0 };
  let catalogController;
  let reportController;
  let modelsController;
  let searchTimer;
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const formatUsd = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 3 }).format(number(value));
  const compact = (value) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(number(value));
  const exact = (value) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(number(value));
  const formatMetric = (value, metric) => metric === "spend" ? formatUsd(value) : compact(value);
  const route = (path) => (basePath || "") + path;
  const text = (id, value) => { byId(id).textContent = value; };
  const notice = (id, message, error = false) => { text(id, message); byId(id).classList.toggle("error", error); };

  byId("userSearch").addEventListener("input", () => {
    clearTimeout(searchTimer);
    byId("keyDirectory").open = true;
    catalogController?.abort();
    searchTimer = setTimeout(() => { state.page = 1; loadVirtualKeys(); }, 250);
  });
  for (const id of ["keySort", "pageSize"]) byId(id).addEventListener("change", () => { clearTimeout(searchTimer); byId("keyDirectory").open = true; state.page = 1; loadVirtualKeys(); });
  byId("previousPage").addEventListener("click", () => { state.page -= 1; loadVirtualKeys(); });
  byId("nextPage").addEventListener("click", () => { state.page += 1; loadVirtualKeys(); });
  byId("keyRows").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-key-id]");
    const key = button && state.keys.find((candidate) => candidate.id === button.dataset.keyId);
    if (key) { byId("keyDirectory").open = false; selectKey(key); }
  });
  byId("period").addEventListener("change", () => runReport());
  byId("trendMetric").addEventListener("change", renderTrend);
  byId("modelMetric").addEventListener("change", renderModels);
  byId("refresh").addEventListener("click", async () => {
    byId("refresh").disabled = true;
    clearTimeout(searchTimer);
    try {
      const loaded = await loadVirtualKeys(true);
      if (loaded && state.selectedKey) await Promise.all([runReport(), loadModels()]);
    } finally { byId("refresh").disabled = false; }
  });
  for (const id of ["modelSearch", "estimateInput", "estimateOutput"]) byId(id).addEventListener("input", () => { state.modelPage = 1; renderAvailableModels(); });
  for (const id of ["modelScope", "catalogModelSort"]) byId(id).addEventListener("change", () => { state.modelPage = 1; renderAvailableModels(); });
  byId("previousModelPage").addEventListener("click", () => { state.modelPage -= 1; renderAvailableModels(); });
  byId("nextModelPage").addEventListener("click", () => { state.modelPage += 1; renderAvailableModels(); });
  byId("openAssistant").addEventListener("click", () => {
    if (state.report) publishContext(state.report);
    window.parent?.postMessage({ type: "caipe.agenticApp.assistant.open.v1", version: "1.0", appId: "litellm" }, window.location.origin);
  });
  window.addEventListener("caipe:microfrontend-initialize", (event) => {
    const period = { "30d": "month", "90d": "3m" }[event.detail?.preferences?.defaultRange];
    if (period && byId("period").value !== period) {
      byId("period").value = period;
      if (state.selectedKey) runReport();
    }
  });
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => { if (state.report) renderTrend(); }).observe(byId("trendChart"));

  async function loadVirtualKeys(refresh = false) {
    catalogController?.abort();
    const controller = new AbortController();
    catalogController = controller;
    byId("catalog").setAttribute("aria-busy", "true");
    byId("previousPage").disabled = true;
    byId("nextPage").disabled = true;
    notice("catalogStatus", "Loading keys…");
    const query = new URLSearchParams({ page: String(state.page), size: byId("pageSize").value, sort: byId("keySort").value, search: byId("userSearch").value.trim() });
    if (refresh) query.set("refresh", "true");
    try {
      const payload = await requestJson(route("/api/virtual-keys") + "?" + query, controller.signal);
      if (controller.signal.aborted) return false;
      state.keys = payload.keys;
      state.pagination = payload.pagination;
      state.page = payload.pagination.page;
      state.maxSpend = payload.maxSpend;
      renderKeys();
      notice("catalogStatus", "Key spend updated " + new Date(payload.updatedAt).toLocaleString() + ".");
      if (!state.selectedKey && state.keys.length) selectKey(state.keys[0]);
      else if (!state.selectedKey) { notice("reportStatus", "No virtual key selected. Search by username, email, or key name."); loadModels(); }
      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;
      state.keys = [];
      text("catalogCount", "Keys unavailable");
      byId("keyRows").innerHTML = '<tr><td colspan="4" class="empty">Could not load virtual keys.</td></tr>';
      text("pageInfo", "");
      notice("catalogStatus", error.message, true);
      if (!state.selectedKey) loadModels();
      return false;
    } finally {
      if (!controller.signal.aborted) {
        byId("catalog").setAttribute("aria-busy", "false");
        byId("refresh").disabled = false;
      }
    }
  }

  function renderKeys() {
    const pagination = state.pagination;
    text("catalogCount", exact(pagination.totalCount) + " matching / " + exact(pagination.totalKeys) + " keys");
    text("pageInfo", pagination.totalCount ? "Showing " + ((pagination.page - 1) * pagination.size + 1) + "–" + Math.min(pagination.page * pagination.size, pagination.totalCount) + " · Page " + pagination.page + " of " + pagination.totalPages : "No matching keys");
    byId("previousPage").disabled = pagination.page <= 1;
    byId("nextPage").disabled = pagination.page >= pagination.totalPages;
    byId("keyRows").innerHTML = state.keys.length ? state.keys.map((key) => {
      const selected = key.id === state.selectedKey?.id;
      const width = state.maxSpend > 0 ? Math.max(0, key.spend) / state.maxSpend * 100 : 0;
      return '<tr><td><strong>' + escapeHtml(key.label) + '</strong><span class="owner">' + escapeHtml(key.owner) + '</span></td><td class="numeric spend-cell">' + escapeHtml(formatUsd(key.spend)) + '<div class="spend-track" aria-hidden="true"><i style="width:' + width + '%"></i></div></td><td class="numeric">' + (key.remainingBudget === null ? '<span class="muted">Not configured</span>' : escapeHtml(formatUsd(key.remainingBudget))) + '</td><td><button class="key-choice" data-key-id="' + escapeHtml(key.id) + '" aria-label="View usage for ' + escapeHtml(key.label) + '" aria-pressed="' + selected + '">' + (selected ? "Selected" : "View usage") + '</button></td></tr>';
    }).join("") : '<tr><td colspan="4" class="empty">No keys match your search. Try a username without the email suffix.</td></tr>';
  }

  function selectKey(key) {
    state.selectedKey = key;
    text("selectedTitle", "Usage for " + key.label);
    text("selectedOwner", key.owner);
    renderKeys();
    runReport();
    loadModels();
  }

  async function runReport() {
    if (!state.selectedKey) return;
    reportController?.abort();
    const controller = new AbortController();
    reportController = controller;
    state.report = null;
    byId("reportContent").hidden = true;
    byId("usageSection").setAttribute("aria-busy", "true");
    notice("reportStatus", "Loading usage for " + state.selectedKey.label + "…");
    const query = new URLSearchParams({ key: state.selectedKey.id, period: byId("period").value });
    try {
      const payload = await requestJson(route("/api/usage") + "?" + query, controller.signal);
      if (controller.signal.aborted) return;
      state.report = payload.data;
      renderReport();
      publishContext(state.report);
      notice("reportStatus", "");
    } catch (error) {
      if (!controller.signal.aborted) notice("reportStatus", error.message, true);
    } finally { if (!controller.signal.aborted) byId("usageSection").setAttribute("aria-busy", "false"); }
  }

  async function loadModels() {
    modelsController?.abort();
    const controller = new AbortController();
    modelsController = controller;
    state.modelCatalog = null;
    state.modelPage = 1;
    byId("availableModels").hidden = false;
    byId("availableModels").setAttribute("aria-busy", "true");
    text("availableModelCount", "");
    text("provisioningSummary", state.selectedKey ? "Loading provisioning for " + state.selectedKey.label + "…" : "No key selected. Loading model prices…");
    byId("provisioningDetails").replaceChildren();
    byId("availableModelRows").replaceChildren();
    text("modelPageInfo", "");
    text("modelPricesFreshness", "");
    byId("previousModelPage").disabled = true;
    byId("nextModelPage").disabled = true;
    notice("availableModelsStatus", "Loading model inventory and pricing…");
    try {
      const payload = await requestJson(route("/api/models") + (state.selectedKey ? "?key=" + encodeURIComponent(state.selectedKey.id) : ""), controller.signal);
      if (controller.signal.aborted) return;
      state.modelCatalog = payload.data;
      renderProvisioning();
      renderAvailableModels();
    } catch (error) {
      if (!controller.signal.aborted) {
        text("provisioningSummary", "Key provisioning is unavailable.");
        notice("availableModelsStatus", error.message, true);
      }
    } finally { if (!controller.signal.aborted) byId("availableModels").setAttribute("aria-busy", "false"); }
  }

  function renderProvisioning() {
    const catalog = state.modelCatalog, policy = catalog.provisioning;
    text("provisioningSummary", catalog.virtualKey ? "Provisioning for " + catalog.virtualKey.label + " · Key status: " + policy.status : "Select a virtual key to inspect its provisioning. Model prices can be compared without one.");
    const list = (values) => values === null ? "Not supplied / unresolved" : values.length ? values.join(", ") : "No model list restriction supplied; inherited policies still apply";
    const lines = [
      "Key model list: " + list(policy.models),
      policy.teamId ? "Team: " + policy.teamId + " · Models: " + list(policy.teamModels) : "Owner models: " + list(policy.ownerModels ?? null),
      "Requests/min: " + (policy.rpmLimit ?? "Not supplied") + " · Tokens/min: " + (policy.tpmLimit ?? "Not supplied"),
      "Key expiry: " + (policy.expiresAt ?? "Not supplied"),
    ];
    byId("provisioningDetails").replaceChildren();
    for (const value of lines) { const node = document.createElement("p"); node.textContent = value; byId("provisioningDetails").append(node); }
    text("modelPricesFreshness", "Source: LiteLLM /model/info and key provisioning records · Loaded: " + new Date(catalog.updatedAt).toLocaleString());
  }

  function renderAvailableModels() {
    const catalog = state.modelCatalog;
    if (!catalog) return;
    const inputTokens = Number(byId("estimateInput").value), outputTokens = Number(byId("estimateOutput").value);
    if (!byId("estimateInput").value.trim() || !byId("estimateOutput").value.trim() || ![inputTokens, outputTokens].every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000)) {
      notice("availableModelsStatus", "Enter whole token counts from 0 to 1,000,000,000.", true);
      byId("availableModelRows").replaceChildren();
      byId("previousModelPage").disabled = true;
      byId("nextModelPage").disabled = true;
      return;
    }
    const estimate = (model) => estimateModelRequestCost(model, inputTokens, outputTokens);
    const query = byId("modelSearch").value.trim().toLowerCase();
    const matches = catalog.models.filter((model) => (!query || [model.name, model.provider, model.upstreamModel].some((value) => value?.toLowerCase().includes(query))) && (byId("modelScope").value === "all" || ["Listed on key", "Model group listed", "Key wildcard match"].includes(model.keyProvisioning)));
    const sort = byId("catalogModelSort").value;
    const price = (model) => sort === "input" ? model.inputCostPerMillion ?? null : sort === "output" ? model.outputCostPerMillion ?? null : estimate(model);
    matches.sort((a, b) => {
      const left = price(a), right = price(b);
      if (sort !== "name") {
        if (left === null && right !== null) return 1;
        if (left !== null && right === null) return -1;
        if (left !== null && right !== null && left !== right) return left - right;
      }
      return (a.name ?? "").localeCompare(b.name ?? "") || (a.id ?? "").localeCompare(b.id ?? "");
    });
    const totalPages = Math.max(1, Math.ceil(matches.length / 10));
    state.modelPage = Math.max(1, Math.min(state.modelPage, totalPages));
    const rows = matches.slice((state.modelPage - 1) * 10, state.modelPage * 10);
    const displayPrice = (value) => value === undefined || value === null ? "Not supplied" : value > 0 && value < 0.000001 ? "<$0.000001" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 }).format(value);
    text("availableModelCount", exact(matches.length) + " matching / " + exact(catalog.totalModels) + " deployments");
    text("modelPageInfo", matches.length ? "Page " + state.modelPage + " of " + totalPages : "No matching models");
    byId("previousModelPage").disabled = state.modelPage <= 1;
    byId("nextModelPage").disabled = state.modelPage >= totalPages;
    byId("availableModelRows").innerHTML = rows.map((model) => '<tr><th scope="row">' + escapeHtml(model.name ?? "Unnamed deployment") + '<span class="owner">' + escapeHtml(model.provider ?? "Provider not supplied") + (model.id ? ' · ' + escapeHtml(model.id) : '') + '</span>' + (model.pricingHasVariants ? '<span class="owner">Additional pricing variants configured</span>' : '') + '</th><td>' + escapeHtml(model.mode ?? "Not supplied") + '</td><td>' + escapeHtml(model.keyProvisioning) + '</td><td class="numeric">' + escapeHtml(displayPrice(model.inputCostPerMillion)) + '</td><td class="numeric">' + escapeHtml(displayPrice(model.outputCostPerMillion)) + '</td><td class="numeric">' + escapeHtml(estimate(model) === null ? "Unavailable" : displayPrice(estimate(model))) + '</td></tr>').join("") || '<tr><td colspan="6" class="empty">No configured models match these filters.</td></tr>';
    notice("availableModelsStatus", catalog.provisioning.warnings.join(" "), Boolean(catalog.provisioning.warnings.length));
  }

  async function requestJson(url, signal) {
    const response = await fetch(url, { credentials: "same-origin", headers: { accept: "application/json" }, signal });
    if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Could not load dashboard data (HTTP " + response.status + "). Refresh GRID if your session has expired.");
    const payload = await response.json();
    if (!response.ok || payload.success === false) throw new Error(payload.error || "Dashboard request failed (HTTP " + response.status + ")");
    return payload;
  }

  function renderReport() {
    const report = state.report;
    state.selectedKey = report.virtualKey;
    text("selectedTitle", "Usage for " + report.virtualKey.label);
    text("selectedOwner", report.virtualKey.owner);
    renderKeys();
    byId("reportContent").hidden = false;
    text("rangeLabel", report.range.label + " · " + report.range.startDate + " to " + report.range.endDate + " · UTC");
    text("spend", formatUsd(report.totals.spend));
    text("tokens", compact(report.totals.totalTokens));
    text("requests", exact(report.totals.requests));
    text("tokenSplit", compact(report.totals.promptTokens) + " input · " + compact(report.totals.completionTokens) + " output");
    renderTrend();
    renderModels();
    renderBudget(report.virtualKey);
    byId("warnings").hidden = !report.warnings.length;
    text("warnings", report.warnings.join(" "));
    text("freshness", "Source: LiteLLM API · Usage loaded: " + new Date(report.generatedAt).toLocaleString() + " · Key budgets updated: " + new Date(report.keysUpdatedAt).toLocaleString());
  }

  function renderTrend() {
    const report = state.report;
    if (!report) return;
    const metric = byId("trendMetric").value;
    const rows = report.trend;
    const chart = byId("trendChart");
    const maximum = rows.reduce((max, row) => Math.max(max, number(row[metric])), 0);
    const empty = !maximum;
    chart.hidden = empty;
    byId("trendEmpty").hidden = !empty;
    text("trendTitle", report.range.label + " · " + (metric === "spend" ? "spend" : metric === "totalTokens" ? "tokens" : "requests"));
    text("trendEmpty", rows.length ? "No " + (metric === "spend" ? "spend" : metric === "totalTokens" ? "tokens" : "requests") + " recorded in this period." : "No usage returned for this key and period.");
    byId("trendRows").innerHTML = rows.map((row) => '<tr><th scope="row">' + escapeHtml(row.date) + '</th><td class="numeric">' + escapeHtml(formatUsd(row.spend)) + '</td><td class="numeric">' + escapeHtml(exact(row.totalTokens)) + '</td><td class="numeric">' + escapeHtml(exact(row.requests)) + '</td></tr>').join("") || '<tr><td colspan="4" class="empty">No recorded usage.</td></tr>';
    if (empty) { chart.replaceChildren(); return; }
    const width = Math.max(260, chart.getBoundingClientRect().width);
    const height = 240, left = 62, right = 12, top = 22, bottom = 42;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const ceiling = maximum * 1.1;
    const step = plotWidth / rows.length;
    const y = (value) => top + plotHeight * (1 - value / ceiling);
    chart.setAttribute("viewBox", "0 0 " + width + " " + height);
    chart.setAttribute("aria-label", (metric === "spend" ? "Spend in USD" : metric === "totalTokens" ? "Tokens" : "Requests") + " by " + report.range.granularity + " for " + report.virtualKey.label);
    const parts = ['<title>' + escapeHtml(chart.getAttribute("aria-label")) + '</title>'];
    for (const fraction of [0, .5, 1]) {
      const value = ceiling * fraction;
      const tick = metric === "spend" && value >= 1000 ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value) : formatMetric(value, metric);
      parts.push('<line x1="' + left + '" x2="' + (width - right) + '" y1="' + y(value) + '" y2="' + y(value) + '" stroke="var(--line)"/><text x="' + (left - 8) + '" y="' + (y(value) + 4) + '" text-anchor="end" fill="var(--muted)" font-size="11">' + escapeHtml(tick) + '</text>');
    }
    const ticks = new Set([0, rows.length - 1]);
    const tickCount = width < 430 ? 3 : 5;
    for (let i = 1; i < tickCount - 1; i += 1) ticks.add(Math.round(i * (rows.length - 1) / (tickCount - 1)));
    rows.forEach((row, index) => {
      const value = Math.max(0, number(row[metric]));
      const x = left + index * step + step * .15;
      const date = row.date;
      parts.push('<rect x="' + x + '" y="' + y(value) + '" width="' + step * .7 + '" height="' + (top + plotHeight - y(value)) + '" rx="2" fill="var(--series)"><title>' + escapeHtml(date + ": " + formatMetric(value, metric)) + '</title></rect>');
      if (ticks.has(index)) parts.push('<text x="' + (left + (index + .5) * step) + '" y="' + (height - 16) + '" text-anchor="' + (index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle") + '" fill="var(--muted)" font-size="11">' + escapeHtml(date.length > 7 ? date.slice(5) : date) + '</text>');
    });
    chart.innerHTML = parts.join("");
  }

  function renderModels() {
    const report = state.report;
    if (!report) return;
    const metric = byId("modelMetric").value;
    const models = [...(report.models ?? report.topModels)].sort((a, b) => number(b[metric]) - number(a[metric]) || a.name.localeCompare(b.name));
    const nonzero = models.filter((model) => number(model[metric]) > 0);
    const top = nonzero.slice(0, 10);
    const maximum = number(top[0]?.[metric]);
    const metricLabel = metric === "totalTokens" ? "tokens" : metric === "requests" ? "requests" : "spend";
    text("modelsTitle", metric === "spend" ? "Highest-spend models" : "Most-used models");
    text("modelSummary", "Top " + top.length + " of " + models.length + " models, ranked by " + metricLabel + " in the selected period.");
    byId("modelBars").innerHTML = top.map((row) => '<div class="model-bar" role="listitem" aria-label="' + escapeHtml(row.name + ": " + formatMetric(row[metric], metric) + " " + metricLabel) + '"><span class="model-label">' + escapeHtml(row.name) + '</span><div class="model-track" aria-hidden="true"><i style="width:' + number(row[metric]) / maximum * 100 + '%"></i></div><span class="model-value">' + escapeHtml(formatMetric(row[metric], metric)) + '</span></div>').join("") || '<p class="empty">No model ' + metricLabel + ' returned for this key and period.</p>';
    byId("modelRows").innerHTML = models.map((row) => '<tr><th scope="row">' + escapeHtml(row.name) + '</th><td class="numeric">' + escapeHtml(formatUsd(row.spend)) + '</td><td class="numeric">' + escapeHtml(exact(row.promptTokens)) + '</td><td class="numeric">' + escapeHtml(exact(row.completionTokens)) + '</td><td class="numeric">' + escapeHtml(exact(row.requests)) + '</td><td class="numeric">' + (report.totals.spend > 0 ? escapeHtml((row.spend / report.totals.spend * 100).toFixed(1) + "%") : "—") + '</td></tr>').join("") || '<tr><td colspan="6" class="empty">No model activity returned.</td></tr>';
  }

  function renderBudget(key) {
    const configured = key.maxBudget !== null && key.maxBudget >= 0;
    byId("budgetTrack").hidden = !configured || key.maxBudget === 0;
    text("budgetRemaining", configured ? formatUsd(key.remainingBudget) : "Not configured");
    text("remainingLabel", configured ? (key.maxBudget === 0 ? "No allowance configured (zero budget)." : "Remaining in this key’s budget") : "A budget limit is needed to calculate remaining credit.");
    text("budgetSummary", configured ? formatUsd(key.spend) + " spent of " + formatUsd(key.maxBudget) + (key.budgetUtilizationPercent === null ? "" : " · " + key.budgetUtilizationPercent.toFixed(1) + "% used") : "Recorded key spend: " + formatUsd(key.spend));
    byId("budgetBar").style.width = Math.min(100, Math.max(0, key.budgetUtilizationPercent ?? 0)) + "%";
    byId("budgetTrack").classList.toggle("over", key.spend >= key.maxBudget);
    text("budgetSubtitle", key.budgetDuration ? "Budget period: " + key.budgetDuration : "Lifetime spend / no reset period supplied");
    const reset = key.budgetResetAt ? new Date(key.budgetResetAt) : null;
    const resetLabel = reset && Number.isFinite(reset.getTime()) ? reset.toLocaleString() : key.budgetResetAt;
    byId("budgetMeta").replaceChildren();
    const lines = [resetLabel ? "Next reset: " + resetLabel : "Next reset: not supplied", key.teamId ? "Team: " + key.teamId : "", configured && key.spend > key.maxBudget ? "Over budget by " + formatUsd(key.spend - key.maxBudget) : ""];
    for (const value of lines.filter(Boolean)) { const node = document.createElement("p"); node.textContent = value; byId("budgetMeta").append(node); }
  }

  function publishContext(report) {
    const selection = { ...report, models: undefined, topModels: report.topModels.slice(0, 10), trend: report.trend.slice(-24) };
    window.parent?.postMessage({
      type: "caipe.agenticApp.context.v1", version: "1.0", appId: "litellm",
      context: {
        route: appPath, title: "LiteLLM operations dashboard", agentId, mcpServerId: "litellm", domainAnswersRequireMcp: true,
        summary: report.virtualKey.label + " used " + formatUsd(report.totals.spend) + ", " + compact(report.totals.totalTokens) + " tokens, and " + exact(report.totals.requests) + " requests in " + report.range.label + ".",
        selection: JSON.stringify(selection).slice(0, 8000),
        resourceRefs: [{ kind: "agent", id: agentId }, { kind: "mcp-server", id: "litellm-mcp" }, { kind: "schema", id: "litellm.dashboard.v1" }],
        suggestedPrompts: ["Explain this virtual key's spend and token trend.", "Is this virtual key on track to exceed its budget?", "Which models drive this virtual key's usage?"],
      },
    }, window.location.origin);
  }

  loadVirtualKeys();
}
