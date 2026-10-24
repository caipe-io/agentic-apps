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
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 20px; }
    .tabs button { flex: 1; min-width: 0; background: transparent; border: 0; border-bottom: 3px solid transparent; border-radius: 8px 8px 0 0; padding: 12px 16px; color: var(--muted); }
    .tabs button[aria-selected="true"] { color: var(--series); border-bottom-color: var(--series); background: var(--surface); font-weight: 600; }
    .actions, .controls { display: flex; align-items: end; gap: 12px; flex-wrap: wrap; } .controls { margin: 16px 0 12px; }
    label { display: grid; gap: 5px; color: var(--muted); font-size: .82rem; }
    .search-field { flex: 1; min-width: min(260px, 100%); }
    .user-picker { position: relative; flex: 1; min-width: min(300px, 100%); }
    .picker-input { display: flex; gap: 6px; } .picker-input input { min-width: 0; } .picker-input button { flex: 0 0 auto; }
    .picker-popup { position: absolute; z-index: 10; top: calc(100% + 6px); left: 0; right: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 16px 36px #0006; overflow: hidden; }
    .picker-options { max-height: min(330px, 32vh); overflow-y: auto; overscroll-behavior: contain; }
    .picker-owner { padding: 10px 12px 4px; color: var(--muted); font-size: .8rem; overflow-wrap: anywhere; }
    .picker-option { display: flex; justify-content: space-between; gap: 16px; padding: 9px 12px 9px 24px; cursor: pointer; font-size: .9rem; overflow-wrap: anywhere; }
    .picker-option[aria-selected="true"] { color: var(--series); } .picker-option[data-active="true"], .picker-option:hover { background: var(--track); }
    .picker-option .numeric { flex-shrink: 0; color: var(--muted); font-size: .8rem; } .picker-option small { display: block; }
    .picker-footer { border-top: 1px solid var(--line); padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .picker-footer .actions { gap: 6px; } .picker-footer button { min-height: 32px; padding: 4px 8px; font-size: .8rem; }
    .picker-selection { margin: 6px 0 0; overflow-wrap: anywhere; } .picker-help { margin-top: 8px; }
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
    .scope-switch { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; } .scope-switch button[aria-pressed="true"] { border-color: var(--series); color: var(--series); }
    .viewing-context { padding: 10px 14px; border-left: 3px solid var(--series); background: var(--surface); margin-bottom: 14px; overflow-wrap: anywhere; }
    .budget-scope { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 12px; } .budget-scope strong { display: block; color: var(--text); }
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
    .calculator { margin: 24px 0; padding: 20px; border: 1px solid var(--line); border-radius: 10px; } .calculator h3 { margin: 0; font-size: 1.1rem; }
    .calculator-table { min-width: 1050px; margin-top: 14px; } .calculator-table th:first-child { min-width: 190px; overflow-wrap: anywhere; } .calculator-table input { width: 125px; text-align: right; } .calculator-table .request-input { width: 100px; }
    .calculator-table .actions { gap: 6px; flex-wrap: nowrap; } .calculator-table button { font-size: .8rem; } .calculator-table input[aria-invalid="true"] { border-color: var(--error); }
    .calculator-totals { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 16px; margin-top: 18px; } .calculator-totals strong { display: block; font-size: 1.35rem; font-variant-numeric: tabular-nums; } .calculator-totals > div:last-child strong { color: var(--series); }
    .empty { padding: 26px 12px; color: var(--muted); text-align: center; } .notice { color: var(--muted); margin: 10px 0; } .notice.error { color: var(--error); } .warning { color: var(--warning); margin-top: 10px; }
    .freshness { color: var(--muted); font-size: .8rem; margin: 16px 0 0; } footer { color: var(--muted); font-size: .8rem; margin-top: 22px; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; } a { color: var(--series); }
    [hidden] { display: none !important; } body.compact main { padding-top: 18px; } body.compact .panel { padding: 16px; }
    @media (max-width: 850px) { .layout { grid-template-columns: 1fr; } }
    @media (max-width: 580px) { main { width: calc(100% - 24px); } .heading .actions { width: 100%; } .controls > label { flex: 1; } .kpis, .calculator-totals { grid-template-columns: 1fr; } .calculator { padding: 12px; } .selection > * { width: 100%; } .model-bar { grid-template-columns: 1fr auto; gap: 5px 12px; } .model-track { grid-column: 1 / -1; grid-row: 2; } .pagination { align-items: start; } }
    @media (pointer: coarse) { button, select, input { min-height: 44px; } }
  </style>
</head>
<body class="${compact ? "compact" : ""}">
<main>
  <header class="heading">
    <div><h1>LLM usage &amp; budgets</h1><p class="subtitle">Find your virtual key, track your balance, and see which models drive usage.</p></div>
    <div class="actions"><button id="compareModels">Compare models</button><button id="copyViewLink" disabled>Copy link</button><button id="refresh" disabled>Refresh data</button><button id="openAssistant" class="primary">Ask LiteLLM</button></div>
  </header>
  <div class="tabs" role="tablist" aria-label="Dashboard views" id="dashboardTabs">
    <button role="tab" id="usageTab" aria-selected="true" aria-controls="usageTabPanel" tabindex="0">Usage &amp; budgets</button>
    <button role="tab" id="calculatorTab" aria-selected="false" aria-controls="calculatorTabPanel" tabindex="-1">Model cost calculator</button>
  </div>
  <section class="panel catalog" aria-labelledby="usersTitle" aria-busy="true" id="catalog">
    <div class="panel-heading"><h2 id="usersTitle">Users &amp; virtual keys</h2><span id="catalogCount" class="muted small" role="status" aria-live="polite">Loading keys…</span></div>
    <p id="identityStatus" class="muted small" role="status">Matching your signed-in email to your keys…</p>
    <div class="scope-switch" role="group" aria-label="Whose usage to view"><button id="myUsage" aria-pressed="true">My usage</button><button id="findUsers" aria-pressed="false">Find users</button></div>
    <p id="userSelection" class="small picker-selection" role="status">No user selected.</p>
    <div class="controls">
      <div class="user-picker" id="userPicker">
        <label for="userSearch" id="userSearchLabel">Select a user or virtual key</label>
        <div class="picker-input"><input id="userSearch" type="search" role="combobox" aria-labelledby="userSearchLabel" aria-autocomplete="list" aria-expanded="false" aria-controls="userOptions" aria-describedby="userSearchHelp userSelection" placeholder="Search username, email, or key name…" autocomplete="off" /><button id="toggleUsers" aria-label="Show users" aria-expanded="false" aria-controls="userOptions">▾</button></div>
        <div id="userPopup" class="picker-popup" hidden>
          <div id="userOptions" class="picker-options" role="listbox" aria-label="Users and virtual keys" aria-busy="true"></div>
          <div class="picker-footer"><span id="pickerStatus" class="muted small" role="status" aria-live="polite">Loading users…</span><div class="actions"><button id="retryUsers" hidden>Retry</button><button id="pickerPrevious" disabled aria-label="Previous user results">Previous</button><button id="pickerNext" disabled aria-label="Next user results">Next</button></div></div>
        </div>
      </div>
      <label>Sort by<select id="keySort"><option value="spend">Highest spend</option><option value="spend-asc">Lowest spend</option><option value="name">Username A–Z</option></select></label>
    </div>
    <p id="userSearchHelp" class="muted small picker-help">Type to find a user, then select their key from the dropdown. Use ↑ / ↓ and Enter to choose.</p>
    <details id="keyDirectory" class="directory"><summary>Browse key spend ranking</summary>
    <p class="muted small catalog-note">Choose a key to view its usage. Each row is one key, not a team total. Key spend follows its own budget cycle; user and team budgets appear after selection.</p>
    <div class="table-wrap"><table aria-label="Matching virtual keys"><thead><tr><th scope="col">Owner / virtual key</th><th scope="col" class="numeric">Key spend</th><th scope="col" class="numeric">Key budget remaining</th><th scope="col">Usage</th></tr></thead><tbody id="keyRows"><tr><td colspan="4" class="empty">Loading virtual keys…</td></tr></tbody></table></div>
    <nav class="pagination" aria-label="Virtual-key pages"><span id="pageInfo" class="muted small"></span><div class="actions"><label>Rows<select id="pageSize"><option>10</option><option>25</option><option>50</option></select></label><button id="previousPage" disabled>Previous</button><button id="nextPage" disabled>Next</button></div></nav>
    </details>
    <p id="catalogStatus" class="notice small" role="status" aria-live="polite"></p>
    <p id="shareStatus" class="notice small" role="status" aria-live="polite"></p>
    <label id="shareLinkField" hidden>Shareable dashboard link<input id="shareLinkInput" type="url" readonly /></label>
  </section>
  <div id="usageTabPanel" role="tabpanel" aria-labelledby="usageTab">
  <section aria-labelledby="selectedTitle" id="usageSection">
    <p id="viewingContext" class="viewing-context small" hidden></p>
    <div class="selection"><div><h2 id="selectedTitle">Select a user or virtual key</h2><p id="selectedOwner" class="muted small"></p></div><label>Usage period<select id="period"><option value="current">Today</option><option value="month" selected>Current month</option><option value="3m">Last 3 months</option><option value="6m">Last 6 months</option><option value="12m">Last 12 months</option></select></label></div>
    <p id="reportStatus" class="notice" role="status" aria-live="polite">Usage will load after the key list is ready.</p>
    <div id="reportContent" hidden>
      <p id="rangeLabel" class="muted small"></p>
      <section class="kpis" aria-label="Usage in selected period"><article class="panel kpi"><span class="muted small">Period spend</span><strong id="spend">—</strong><small>USD in selected period</small></article><article class="panel kpi"><span class="muted small">Total tokens</span><strong id="tokens">—</strong><small id="tokenSplit">Input and output</small></article><article class="panel kpi"><span class="muted small">Requests</span><strong id="requests">—</strong><small>Reported API requests</small></article></section>
      <div class="layout">
        <section class="panel" aria-labelledby="trendTitle"><div class="panel-heading"><h2 id="trendTitle">Usage trend</h2><label>Chart measure<select id="trendMetric"><option value="spend">Spend · USD</option><option value="totalTokens">Tokens</option><option value="requests">Requests</option></select></label></div><div id="trendEmpty" class="empty" hidden></div><svg id="trendChart" class="chart" role="img" aria-label="Usage by date"></svg><details><summary>View trend data</summary><div class="table-wrap"><table aria-label="Usage by date"><thead><tr><th scope="col">Date (UTC)</th><th scope="col" class="numeric">Spend</th><th scope="col" class="numeric">Tokens</th><th scope="col" class="numeric">Requests</th></tr></thead><tbody id="trendRows"></tbody></table></div></details></section>
        <section class="panel" aria-labelledby="budgetTitle"><h2 id="budgetTitle">Configured budgets</h2><p class="muted small" id="budgetSubtitle">Budget cycle / lifetime</p><div id="budgetRemaining" class="budget-value">—</div><p id="remainingLabel" class="muted small">Remaining</p><div id="budgetTrack" class="budget-track"><i id="budgetBar"></i></div><p id="budgetSummary" class="small"></p><div id="budgetMeta" class="budget-meta"></div><div id="budgetScopes" class="budget-meta"></div><p class="muted small">Budget records have separate spend and reset periods. Team and personal-key policies can differ; the gateway enforces the applicable limits.</p></section>
      </div>
      <section class="panel" aria-labelledby="modelsTitle"><div class="panel-heading"><h2 id="modelsTitle">Most-used models</h2><label>Rank models by<select id="modelMetric"><option value="totalTokens">Tokens</option><option value="requests">Requests</option><option value="spend">Spend · USD</option></select></label></div><p id="modelSummary" class="muted small"></p><div id="modelBars" class="model-bars" role="list" aria-label="Top models"></div><details class="model-details"><summary>View model details</summary><div class="table-wrap"><table class="detail-table" aria-label="Model usage details"><thead><tr><th scope="col">Model</th><th scope="col" class="numeric">Spend</th><th scope="col" class="numeric">Input tokens</th><th scope="col" class="numeric">Output tokens</th><th scope="col" class="numeric">Requests</th><th scope="col" class="numeric">Spend share</th></tr></thead><tbody id="modelRows"></tbody></table></div></details></section>
      <p id="warnings" class="warning small" role="status" hidden></p><p id="freshness" class="freshness"></p>
    </div>
  </section>
  </div>
  <div id="calculatorTabPanel" role="tabpanel" aria-labelledby="calculatorTab" hidden>
    <p id="modelsPendingStatus" class="notice" role="status">Model prices will load after the key list is ready.</p>
    <section class="panel available-models" id="availableModels" aria-labelledby="availableModelsTitle" hidden>
      <div class="panel-heading"><h2 id="availableModelsTitle">Available models &amp; price comparison</h2><span id="availableModelCount" class="muted small"></span></div>
      <p id="provisioningSummary" class="provisioning-meta small"></p>
      <details><summary>View key provisioning</summary><div id="provisioningDetails" class="budget-meta"></div></details>
      <p class="muted small">Key matches describe declared configuration. Team, owner, organization, access-group, and runtime policies can further restrict calls.</p>
      <section class="calculator" aria-labelledby="calculatorTitle">
        <div class="panel-heading"><h3 id="calculatorTitle">Token cost calculator</h3><div class="actions"><button id="addCalculatorModel">Add a model</button><button id="clearCalculator" disabled>Clear calculator</button></div></div>
        <p class="muted small">Build a workload with multiple model lines. Tokens are per request; each line is multiplied by its request count. Add models from the searchable price table below, or duplicate a line to compare token counts.</p>
        <div class="table-wrap"><table class="calculator-table" aria-label="Multi-model token cost calculator"><thead><tr><th scope="col">Model / key configuration</th><th scope="col" class="numeric">Input tokens / request</th><th scope="col" class="numeric">Output tokens / request</th><th scope="col" class="numeric">Requests</th><th scope="col" class="numeric">Input cost</th><th scope="col" class="numeric">Output cost</th><th scope="col" class="numeric">Line total</th><th scope="col">Actions</th></tr></thead><tbody id="calculatorRows"><tr><td colspan="8" class="empty">Add a model from the price table to start calculating.</td></tr></tbody></table></div>
        <div class="calculator-totals" role="group" aria-label="Calculator totals in USD"><div><span class="muted small">Input cost · USD</span><strong id="calculatorInputTotal">$0.00</strong></div><div><span class="muted small">Output cost · USD</span><strong id="calculatorOutputTotal">$0.00</strong></div><div><span class="muted small">Workload total · USD</span><strong id="calculatorTotal">$0.00</strong></div></div>
        <p id="calculatorStatus" class="notice small" role="status" aria-live="polite">Estimates use the current catalog rates. No requests are sent and no credits are spent.</p>
      </section>
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
      <div class="table-wrap"><table class="available-table" aria-label="Configured model prices and key provisioning"><thead><tr><th scope="col">Model / provider</th><th scope="col">Mode</th><th scope="col">Key configuration</th><th scope="col" class="numeric">Input / 1M</th><th scope="col" class="numeric">Output / 1M</th><th scope="col" class="numeric">Estimated request</th><th scope="col">Calculator</th></tr></thead><tbody id="availableModelRows"></tbody></table></div>
      <nav class="pagination" aria-label="Available-model pages"><span id="modelPageInfo" class="muted small"></span><div class="actions"><button id="previousModelPage" disabled>Previous models</button><button id="nextModelPage" disabled>Next models</button></div></nav>
      <p id="modelPricesFreshness" class="freshness"></p>
    </section>
  </div>
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
  const state = { report: null, keys: [], selectedKey: null, modelCatalog: null, modelPage: 1, page: 1, pagination: null, maxSpend: 0, calculatorRows: [], calculatorNextId: 1, activeTab: "usage" };
  const initialQuery = new URLSearchParams(window.location.search);
  const requestedUser = initialQuery.get("user")?.trim() ?? "";
  const requestedKey = initialQuery.get("key");
  const initialPeriod = initialQuery.get("period");
  let explicitPeriod = ["current", "month", "3m", "6m", "12m"].includes(initialPeriod);
  let selectionRequest = requestedKey || requestedUser ? { key: requestedKey, user: requestedUser } : null;
  state.scope = selectionRequest ? "all" : "mine";
  state.viewer = null;
  state.search = requestedUser;
  state.pickerOpen = false;
  state.activeOption = -1;
  state.catalogLoading = true;
  state.catalogError = "";
  byId("userSearch").value = requestedUser;
  if (explicitPeriod) byId("period").value = initialPeriod;
  if (["spend", "spend-asc", "name"].includes(initialQuery.get("sort"))) byId("keySort").value = initialQuery.get("sort");
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
  const displayPrice = (value) => value === undefined || value === null ? "Not supplied" : value > 0 && value < 0.000001 ? "<$0.000001" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 }).format(value);
  const modelIdentity = (model) => JSON.stringify(model.id ? [model.id, model.name] : [model.name, model.provider, model.upstreamModel, model.inputCostPerMillion, model.outputCostPerMillion]);
  const route = (path) => (basePath || "") + path;
  const text = (id, value) => { byId(id).textContent = value; };
  const notice = (id, message, error = false) => { text(id, message); byId(id).classList.toggle("error", error); };
  const tabs = [
    { name: "usage", button: "usageTab", panel: "usageTabPanel" },
    { name: "calculator", button: "calculatorTab", panel: "calculatorTabPanel" },
  ];
  for (const tab of tabs) byId(tab.button).addEventListener("click", () => activateTab(tab.name));
  byId("dashboardTabs").addEventListener("keydown", (event) => {
    const current = tabs.findIndex((tab) => tab.button === event.target.id);
    if (current < 0) return;
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" ? (current + 1) % tabs.length : event.key === "ArrowLeft" ? (current + tabs.length - 1) % tabs.length : null;
    if (next === null) return;
    event.preventDefault();
    activateTab(tabs[next].name, true);
  });
  byId("compareModels").addEventListener("click", () => activateTab("calculator", true));
  window.addEventListener("hashchange", () => { if (window.location.hash === "#availableModels") activateTab("calculator"); });
  activateTab(initialQuery.get("tab") === "calculator" || window.location.hash === "#availableModels" ? "calculator" : "usage");

  function activateTab(name, focus = false) {
    state.activeTab = name;
    for (const tab of tabs) {
      const selected = tab.name === name;
      byId(tab.button).setAttribute("aria-selected", String(selected));
      byId(tab.button).tabIndex = selected ? 0 : -1;
      byId(tab.panel).hidden = !selected;
      if (selected && focus) byId(tab.button).focus();
    }
    clearSharedLink();
    if (name === "usage" && state.report) renderTrend();
  }

  byId("userSearch").addEventListener("input", () => {
    clearTimeout(searchTimer);
    catalogController?.abort();
    state.scope = "all";
    state.search = byId("userSearch").value.trim();
    state.catalogLoading = true;
    state.catalogError = "";
    state.activeOption = -1;
    renderScope();
    // Typing only searches. Opening another user's usage requires an explicit selection.
    selectionRequest = null;
    openUserPicker();
    searchTimer = setTimeout(() => { state.page = 1; loadVirtualKeys(); }, 250);
  });
  byId("userSearch").addEventListener("focus", () => { byId("userSearch").value = state.search; openUserPicker(); });
  byId("userSearch").addEventListener("click", () => { if (!state.pickerOpen) openUserPicker(); });
  byId("toggleUsers").addEventListener("click", () => {
    if (state.pickerOpen) closeUserPicker();
    else { byId("userSearch").focus(); openUserPicker(); }
  });
  byId("userSearch").addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); closeUserPicker(); return; }
    if (event.key === "Enter") {
      event.preventDefault();
      if (state.pickerOpen && !state.catalogLoading && !state.catalogError && state.activeOption >= 0) chooseUserOption(state.activeOption);
      else if (!state.pickerOpen) openUserPicker();
      else if (searchTimer) { clearTimeout(searchTimer); state.page = 1; loadVirtualKeys(); }
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    if (!state.pickerOpen && ["Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (!state.pickerOpen) openUserPicker();
    if (state.catalogLoading || state.catalogError || !state.pickerKeys?.length) return;
    const last = state.pickerKeys.length - 1;
    state.activeOption = event.key === "Home" ? 0 : event.key === "End" ? last : event.key === "ArrowDown" ? Math.min(last, state.activeOption + 1) : state.activeOption < 0 ? last : Math.max(0, state.activeOption - 1);
    renderActiveOption(true);
  });
  byId("userOptions").addEventListener("mousedown", (event) => event.preventDefault());
  byId("userOptions").addEventListener("click", (event) => {
    const option = event.target.closest('[role="option"]');
    if (option) chooseUserOption(Number(option.dataset.index));
  });
  byId("userPicker").addEventListener("focusout", (event) => { if (!byId("userPicker").contains(event.relatedTarget)) closeUserPicker(); });
  document.addEventListener("pointerdown", (event) => { if (!byId("userPicker").contains(event.target)) closeUserPicker(); });
  byId("retryUsers").addEventListener("click", () => loadVirtualKeys());
  byId("pickerPrevious").addEventListener("click", () => { state.page -= 1; byId("userSearch").focus(); loadVirtualKeys(); });
  byId("pickerNext").addEventListener("click", () => { state.page += 1; byId("userSearch").focus(); loadVirtualKeys(); });
  for (const [id, scope] of [["myUsage", "mine"], ["findUsers", "all"]]) byId(id).addEventListener("click", () => {
    clearTimeout(searchTimer);
    clearSelection();
    state.scope = scope;
    state.search = "";
    byId("userSearch").value = "";
    selectionRequest = null;
    state.page = 1;
    renderScope();
    loadVirtualKeys();
    if (scope === "all") byId("userSearch").focus();
    else closeUserPicker();
  });
  function renderScope() {
    byId("myUsage").setAttribute("aria-pressed", String(state.scope === "mine"));
    byId("findUsers").setAttribute("aria-pressed", String(state.scope === "all"));
  }
  function openUserPicker() {
    const searchAll = state.scope === "mine";
    state.pickerOpen = true;
    byId("userSearch").value = state.search;
    byId("userSearch").setAttribute("aria-expanded", "true");
    byId("toggleUsers").setAttribute("aria-expanded", "true");
    byId("toggleUsers").setAttribute("aria-label", "Hide users");
    byId("userPopup").hidden = false;
    renderUserOptions();
    if (searchAll) {
      state.scope = "all";
      state.page = 1;
      selectionRequest = null;
      renderScope();
      loadVirtualKeys();
    }
  }
  function closeUserPicker() {
    state.pickerOpen = false;
    state.activeOption = -1;
    byId("userSearch").setAttribute("aria-expanded", "false");
    byId("userSearch").removeAttribute("aria-activedescendant");
    byId("toggleUsers").setAttribute("aria-expanded", "false");
    byId("toggleUsers").setAttribute("aria-label", "Show users");
    byId("userPopup").hidden = true;
    byId("userSearch").value = state.selectedKey ? state.selectedKey.owner + " · " + state.selectedKey.label : state.search;
  }
  function renderUserOptions() {
    const unavailable = state.catalogLoading || Boolean(state.catalogError);
    byId("userOptions").setAttribute("aria-busy", String(state.catalogLoading));
    byId("retryUsers").hidden = !state.catalogError;
    const pagination = state.pagination;
    byId("pickerPrevious").disabled = unavailable || !pagination || pagination.page <= 1;
    byId("pickerNext").disabled = unavailable || !pagination || pagination.page >= pagination.totalPages;
    state.pickerKeys = [];
    if (unavailable || !state.keys.length) {
      state.activeOption = -1;
      byId("userOptions").innerHTML = '<div class="empty">' + (state.catalogLoading ? "Searching users…" : state.catalogError ? "Users could not be loaded. Retry your search." : "No users or keys match. Try a username or email.") + '</div>';
      text("pickerStatus", state.catalogLoading ? "Searching…" : state.catalogError ? "Search unavailable" : "No matches");
    } else {
      // The server owns filtering and paging; group only the authorized page by owner.
      const owners = new Map();
      for (const key of state.keys) {
        if (!owners.has(key.owner)) owners.set(key.owner, []);
        owners.get(key.owner).push(key);
      }
      byId("userOptions").innerHTML = [...owners].map(([owner, keys]) => '<div role="group" aria-label="' + escapeHtml(owner) + '"><div class="picker-owner" aria-hidden="true">' + escapeHtml(owner) + '</div>' + keys.map((key) => {
        const index = state.pickerKeys.push(key) - 1;
        const selected = key.id === state.selectedKey?.id;
        return '<div role="option" id="user-option-' + index + '" class="picker-option" data-index="' + index + '" aria-label="' + escapeHtml(owner + ' · Key: ' + key.label) + '" aria-selected="' + selected + '"><span><strong>' + escapeHtml(key.label) + '</strong><small>' + (selected ? 'Selected key' : 'View this key’s usage') + '</small></span><span class="numeric">' + escapeHtml(formatUsd(key.spend)) + '<small>Key spend</small></span></div>';
      }).join("") + '</div>').join("");
      text("pickerStatus", "Page " + pagination.page + " of " + pagination.totalPages + " · " + exact(pagination.totalCount) + " matching keys");
    }
    renderActiveOption();
  }
  function renderActiveOption(scroll = false) {
    const options = byId("userOptions").querySelectorAll('[role="option"]');
    for (const [index, option] of options.entries()) option.dataset.active = String(state.pickerOpen && index === state.activeOption);
    const active = state.pickerOpen && options[state.activeOption];
    if (active) {
      byId("userSearch").setAttribute("aria-activedescendant", active.id);
      if (scroll) active.scrollIntoView({ block: "nearest" });
    } else byId("userSearch").removeAttribute("aria-activedescendant");
  }
  function chooseUserOption(index) {
    if (state.catalogLoading || state.catalogError) return;
    const key = state.pickerKeys[index];
    if (!key) return;
    selectKey(key);
    byId("userSearch").focus();
    closeUserPicker();
    byId("userSearch").select();
  }
  renderScope();
  for (const id of ["keySort", "pageSize"]) byId(id).addEventListener("change", () => { clearTimeout(searchTimer); clearSharedLink(); state.page = 1; loadVirtualKeys(); });
  byId("previousPage").addEventListener("click", () => { state.page -= 1; loadVirtualKeys(); });
  byId("nextPage").addEventListener("click", () => { state.page += 1; loadVirtualKeys(); });
  byId("keyRows").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-key-id]");
    const key = button && state.keys.find((candidate) => candidate.id === button.dataset.keyId);
    if (key) selectKey(key);
  });
  byId("period").addEventListener("change", () => { explicitPeriod = true; clearSharedLink(); runReport(); });
  byId("copyViewLink").addEventListener("click", async () => {
    const url = new URL(appPath, window.location.origin);
    const user = state.selectedKey?.label ?? byId("userSearch").value.trim();
    if (user) url.searchParams.set("user", user);
    if (state.selectedKey) url.searchParams.set("key", state.selectedKey.id);
    url.searchParams.set("period", byId("period").value);
    url.searchParams.set("sort", byId("keySort").value);
    if (state.activeTab === "calculator") url.searchParams.set("tab", "calculator");
    const link = url.toString();
    byId("shareLinkInput").value = link;
    try {
      await navigator.clipboard.writeText(link);
      notice("shareStatus", "Link copied. Recipients need access to this dashboard.");
    } catch {
      byId("shareLinkField").hidden = false;
      byId("shareLinkInput").focus();
      byId("shareLinkInput").select();
      notice("shareStatus", "Copy the selected link. Recipients need access to this dashboard.");
    }
  });
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
  byId("addCalculatorModel").addEventListener("click", () => { byId("modelSearch").scrollIntoView({ block: "center" }); byId("modelSearch").focus(); });
  byId("clearCalculator").addEventListener("click", () => { state.calculatorRows = []; renderCalculator(); byId("addCalculatorModel").focus(); });
  byId("availableModelRows").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-add-model]");
    const model = button && state.modelCatalog?.models[Number(button.dataset.addModel)];
    if (!model) return;
    const tokens = (id) => byId(id).value.trim() && Number.isSafeInteger(Number(byId(id).value)) && Number(byId(id).value) >= 0 && Number(byId(id).value) <= 1_000_000_000 ? byId(id).value : "1000";
    const row = { id: state.calculatorNextId++, modelIdentity: modelIdentity(model), name: model.name ?? "Unnamed deployment", input: tokens("estimateInput"), output: tokens("estimateOutput"), requests: "1" };
    state.calculatorRows.push(row);
    renderCalculator();
    byId("calculator-input-" + row.id).focus();
  });
  byId("calculatorRows").addEventListener("input", (event) => {
    const input = event.target.closest("input[data-calculator-field]");
    const row = input && state.calculatorRows.find((entry) => entry.id === Number(input.dataset.rowId));
    if (!row) return;
    row[input.dataset.calculatorField] = input.value;
    renderCalculatorCosts();
  });
  byId("calculatorRows").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-calculator-action]");
    const index = button ? state.calculatorRows.findIndex((row) => row.id === Number(button.dataset.rowId)) : -1;
    if (index < 0) return;
    if (button.dataset.calculatorAction === "duplicate") {
      const row = { ...state.calculatorRows[index], id: state.calculatorNextId++ };
      state.calculatorRows.splice(index + 1, 0, row);
      renderCalculator();
      byId("calculator-input-" + row.id).focus();
    } else {
      state.calculatorRows.splice(index, 1);
      renderCalculator();
      const next = state.calculatorRows[Math.min(index, state.calculatorRows.length - 1)];
      (next ? byId("calculator-input-" + next.id) : byId("addCalculatorModel")).focus();
    }
  });
  byId("openAssistant").addEventListener("click", () => {
    if (state.report) publishContext(state.report);
    window.parent?.postMessage({ type: "caipe.agenticApp.assistant.open.v1", version: "1.0", appId: "litellm" }, window.location.origin);
  });
  window.addEventListener("caipe:microfrontend-initialize", (event) => {
    const period = { "30d": "month", "90d": "3m" }[event.detail?.preferences?.defaultRange];
    if (!explicitPeriod && period && byId("period").value !== period) {
      byId("period").value = period;
      clearSharedLink();
      if (state.selectedKey) runReport();
    }
  });
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => { if (state.report) renderTrend(); }).observe(byId("trendChart"));

  function clearSharedLink() {
    notice("shareStatus", "");
    byId("shareLinkField").hidden = true;
    byId("shareLinkInput").value = "";
  }

  function clearSelection() {
    reportController?.abort();
    modelsController?.abort();
    state.selectedKey = null;
    text("userSelection", "No user selected.");
    state.report = null;
    state.modelCatalog = null;
    byId("viewingContext").hidden = true;
    byId("reportContent").hidden = true;
    byId("availableModels").hidden = true;
    byId("modelsPendingStatus").hidden = false;
    text("modelsPendingStatus", "Loading models for the current search…");
    byId("usageSection").setAttribute("aria-busy", "false");
    text("selectedTitle", "Select a user or virtual key");
    text("selectedOwner", "");
    notice("reportStatus", "Choose a matching key to view its usage.");
    clearSharedLink();
  }

  async function loadVirtualKeys(refresh = false) {
    clearTimeout(searchTimer);
    searchTimer = null;
    catalogController?.abort();
    const controller = new AbortController();
    catalogController = controller;
    state.catalogLoading = true;
    state.catalogError = "";
    state.activeOption = -1;
    renderUserOptions();
    byId("catalog").setAttribute("aria-busy", "true");
    byId("previousPage").disabled = true;
    byId("nextPage").disabled = true;
    notice("catalogStatus", "Loading keys…");
    text("catalogCount", "Searching…");
    const query = new URLSearchParams({ scope: state.scope, page: String(state.page), size: byId("pageSize").value, sort: byId("keySort").value, search: state.search });
    const requestedSelection = selectionRequest;
    if (requestedSelection?.key) query.set("key", requestedSelection.key);
    if (requestedSelection?.user) query.set("user", requestedSelection.user);
    if (refresh) query.set("refresh", "true");
    try {
      const payload = await requestJson(route("/api/virtual-keys") + "?" + query, controller.signal);
      if (controller.signal.aborted) return false;
      state.keys = payload.keys;
      state.viewer = payload.viewer;
      const viewer = state.viewer;
      text("identityStatus", viewer?.email ? "Signed in as " + viewer.email + " · " + viewer.linkedKeys + " linked key(s)." : "Your sign-in email is unavailable to this app. Select Find users and search manually; another user's usage will not open automatically.");
      state.pagination = payload.pagination;
      state.page = payload.pagination.page;
      state.maxSpend = payload.maxSpend;
      state.catalogLoading = false;
      renderKeys();
      byId("copyViewLink").disabled = false;
      notice("catalogStatus", "Key spend updated " + new Date(payload.updatedAt).toLocaleString() + ".");
      if (!state.selectedKey) {
        selectionRequest = null;
        if (payload.selectedKey) {
          selectKey(payload.selectedKey);
        } else {
          notice("reportStatus", requestedSelection?.key ? "The linked key was not found. Choose a key from the search results." : payload.pagination.totalCount ? "Choose one of the matching keys to view its usage." : state.scope === "mine" ? "No keys are linked to your signed-in email. Select Find users to search by username, email, or key name." : "No virtual key matches this search.");
          loadModels();
        }
      }
      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;
      state.keys = [];
      state.catalogLoading = false;
      state.catalogError = error.message;
      renderUserOptions();
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
    text("catalogCount", exact(pagination.totalCount) + " matching / " + exact(pagination.totalKeys) + (state.scope === "mine" ? " of your keys" : " keys"));
    text("pageInfo", pagination.totalCount ? "Showing " + ((pagination.page - 1) * pagination.size + 1) + "–" + Math.min(pagination.page * pagination.size, pagination.totalCount) + " · Page " + pagination.page + " of " + pagination.totalPages : "No matching keys");
    byId("previousPage").disabled = pagination.page <= 1;
    byId("nextPage").disabled = pagination.page >= pagination.totalPages;
    byId("keyRows").innerHTML = state.keys.length ? state.keys.map((key) => {
      const selected = key.id === state.selectedKey?.id;
      const width = state.maxSpend > 0 ? Math.max(0, key.spend) / state.maxSpend * 100 : 0;
      return '<tr><td><strong>' + escapeHtml(key.owner) + '</strong><span class="owner">Key: ' + escapeHtml(key.label) + '</span></td><td class="numeric spend-cell">' + escapeHtml(formatUsd(key.spend)) + '<div class="spend-track" aria-hidden="true"><i style="width:' + width + '%"></i></div></td><td class="numeric">' + (key.remainingBudget === null ? '<span class="muted">No key-specific limit</span>' : escapeHtml(formatUsd(key.remainingBudget))) + '</td><td><button class="key-choice" data-key-id="' + escapeHtml(key.id) + '" aria-label="View usage for ' + escapeHtml(key.label) + '" aria-pressed="' + selected + '">' + (selected ? "Selected" : "View usage") + '</button></td></tr>';
    }).join("") : '<tr><td colspan="4" class="empty">No keys match your search. Try a username without the email suffix.</td></tr>';
    renderUserOptions();
  }

  function selectKey(key) {
    clearSharedLink();
    state.selectedKey = key;
    text("userSelection", "Selected: " + key.owner + " · Key: " + key.label);
    if (!state.pickerOpen) byId("userSearch").value = key.owner + " · " + key.label;
    byId("viewingContext").hidden = false;
    const own = state.viewer?.keyIds?.includes(key.id);
    text("viewingContext", (own ? "Your usage" : "Viewing " + key.owner + " — this is not identified as your usage") + " · Virtual key: " + key.label + ". Usage charts cover this key only.");
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
    renderCalculator();
    state.modelPage = 1;
    byId("modelsPendingStatus").hidden = true;
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
      renderCalculator();
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
    text("availableModelCount", exact(matches.length) + " matching / " + exact(catalog.totalModels) + " deployments");
    text("modelPageInfo", matches.length ? "Page " + state.modelPage + " of " + totalPages : "No matching models");
    byId("previousModelPage").disabled = state.modelPage <= 1;
    byId("nextModelPage").disabled = state.modelPage >= totalPages;
    byId("availableModelRows").innerHTML = rows.map((model) => '<tr><th scope="row">' + escapeHtml(model.name ?? "Unnamed deployment") + '<span class="owner">' + escapeHtml(model.provider ?? "Provider not supplied") + (model.id ? ' · ' + escapeHtml(model.id) : '') + '</span>' + (model.pricingHasVariants ? '<span class="owner">Additional pricing variants configured</span>' : '') + '</th><td>' + escapeHtml(model.mode ?? "Not supplied") + '</td><td>' + escapeHtml(model.keyProvisioning) + '</td><td class="numeric">' + escapeHtml(displayPrice(model.inputCostPerMillion)) + '</td><td class="numeric">' + escapeHtml(displayPrice(model.outputCostPerMillion)) + '</td><td class="numeric">' + escapeHtml(estimate(model) === null ? "Unavailable" : displayPrice(estimate(model))) + '</td><td><button data-add-model="' + catalog.models.indexOf(model) + '" aria-label="Add ' + escapeHtml(model.name ?? "unnamed deployment") + ' to calculator">Add to calculator</button></td></tr>').join("") || '<tr><td colspan="7" class="empty">No configured models match these filters.</td></tr>';
    notice("availableModelsStatus", catalog.provisioning.warnings.join(" "), Boolean(catalog.provisioning.warnings.length));
  }

  function renderCalculator() {
    byId("clearCalculator").disabled = !state.calculatorRows.length;
    byId("calculatorRows").innerHTML = state.calculatorRows.map((row, index) => {
      const model = state.modelCatalog?.models.find((entry) => modelIdentity(entry) === row.modelIdentity);
      const input = (field, label, minimum) => '<td class="numeric"><input id="calculator-' + field + '-' + row.id + '" class="' + (field === "requests" ? "request-input" : "token-input") + '" type="number" min="' + minimum + '" max="1000000000" step="1" inputmode="numeric" data-calculator-field="' + field + '" data-row-id="' + row.id + '" value="' + escapeHtml(row[field]) + '" aria-label="' + label + ' for line ' + (index + 1) + '" aria-describedby="calculator-row-status-' + row.id + '" /></td>';
      return '<tr><th scope="row">' + escapeHtml(row.name) + '<span class="owner">' + escapeHtml(model ? [model.provider, model.id, model.keyProvisioning].filter(Boolean).join(" · ") : "Model unavailable in current catalog") + '</span><span class="owner" id="calculator-row-status-' + row.id + '"></span></th>' + input("input", "Input tokens per request", 0) + input("output", "Output tokens per request", 0) + input("requests", "Request count", 1) + '<td class="numeric" id="calculator-input-cost-' + row.id + '"></td><td class="numeric" id="calculator-output-cost-' + row.id + '"></td><td class="numeric" id="calculator-line-cost-' + row.id + '"></td><td><div class="actions"><button data-calculator-action="duplicate" data-row-id="' + row.id + '" aria-label="Duplicate calculator line ' + (index + 1) + '">Duplicate</button><button data-calculator-action="remove" data-row-id="' + row.id + '" aria-label="Remove calculator line ' + (index + 1) + '">Remove</button></div></td></tr>';
    }).join("") || '<tr><td colspan="8" class="empty">Add a model from the price table to start calculating.</td></tr>';
    renderCalculatorCosts();
  }

  function renderCalculatorCosts() {
    let inputTotal = 0, outputTotal = 0, knownTotal = 0, incomplete = 0, incompleteInput = false, incompleteOutput = false;
    for (const row of state.calculatorRows) {
      const model = state.modelCatalog?.models.find((entry) => modelIdentity(entry) === row.modelIdentity);
      const counts = Object.fromEntries(["input", "output", "requests"].map((field) => {
        const value = Number(row[field]);
        const valid = Boolean(row[field].trim()) && Number.isSafeInteger(value) && value >= (field === "requests" ? 1 : 0) && value <= 1_000_000_000;
        byId("calculator-" + field + "-" + row.id).setAttribute("aria-invalid", String(!valid));
        return [field, valid ? value : null];
      }));
      const multiply = (cost) => cost === null || counts.requests === null || !Number.isFinite(cost * counts.requests) ? null : cost * counts.requests;
      const inputCost = model && counts.input !== null ? multiply(estimateModelRequestCost(model, counts.input, 0)) : null;
      const outputCost = model && counts.output !== null ? multiply(estimateModelRequestCost(model, 0, counts.output)) : null;
      const total = inputCost === null || outputCost === null || !Number.isFinite(inputCost + outputCost) ? null : inputCost + outputCost;
      const show = (value) => value === null ? "Unavailable" : displayPrice(value);
      text("calculator-input-cost-" + row.id, show(inputCost));
      text("calculator-output-cost-" + row.id, show(outputCost));
      text("calculator-line-cost-" + row.id, show(total));
      text("calculator-row-status-" + row.id, Object.values(counts).includes(null) ? "Use whole token counts 0–1B and requests 1–1B." : !model ? "Reload prices or add this model again from the catalog." : total === null ? "Token pricing is missing or this mode is not supported." : "Input " + displayPrice(model.inputCostPerMillion) + " · Output " + displayPrice(model.outputCostPerMillion) + " per 1M tokens");
      if (inputCost === null) incompleteInput = true; else inputTotal += inputCost;
      if (outputCost === null) incompleteOutput = true; else outputTotal += outputCost;
      if (total === null) incomplete += 1; else knownTotal += total;
    }
    text("calculatorInputTotal", incompleteInput ? "Unavailable" : displayPrice(inputTotal));
    text("calculatorOutputTotal", incompleteOutput ? "Unavailable" : displayPrice(outputTotal));
    text("calculatorTotal", incomplete ? "Incomplete" : displayPrice(knownTotal));
    notice("calculatorStatus", incomplete ? incomplete + " line(s) need attention. Known complete-line subtotal: " + displayPrice(knownTotal) + ". The workload total is incomplete." : state.calculatorRows.length ? state.calculatorRows.length + " model line(s) · Input cost + output cost = workload total. Estimates exclude pricing tiers, cache discounts, and non-token charges." : "Add models from the price table. Estimates do not send requests or spend credits.", incomplete > 0);
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
    renderBudget(report);
    byId("warnings").hidden = !report.warnings.length;
    text("warnings", report.warnings.join(" "));
    text("freshness", "Source: LiteLLM API · Usage loaded: " + new Date(report.generatedAt).toLocaleString() + " · Key budgets updated: " + new Date(report.keysUpdatedAt).toLocaleString());
  }

  function renderTrend() {
    const report = state.report;
    if (!report || state.activeTab !== "usage") return;
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

  function renderBudget(report) {
    const scopes = report.budgets ?? [{ ...report.virtualKey, scope: "key", status: "catalog" }];
    const labels = { key: "Virtual-key budget", user: "User budget", team: "Team budget" };
    const configured = (budget) => Number.isFinite(budget.maxBudget) && budget.maxBudget >= 0 && budget.status !== "unavailable";
    // Budgets have different grains; never subtract one scope's spend from another scope's limit.
    const order = report.virtualKey.teamId ? ["key", "team", "user"] : ["key", "user", "team"];
    const budget = order.map((scope) => scopes.find((entry) => entry.scope === scope && configured(entry))).find(Boolean) ?? scopes[0];
    const hasLimit = configured(budget), hasSpend = Number.isFinite(budget.spend);
    const resetLabel = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : value || "Not supplied";
    const extent = { key: "This virtual key", user: "Owner's user account across its keys", team: "Shared team account across its keys" };
    text("budgetTitle", labels[budget.scope]);
    text("budgetSubtitle", extent[budget.scope] + " · " + (budget.budgetDuration ? "Budget period: " + budget.budgetDuration : "No reset period supplied"));
    text("budgetRemaining", budget.status === "unavailable" ? "Unavailable" : hasLimit ? Number.isFinite(budget.remainingBudget) ? formatUsd(budget.remainingBudget) : "Spend unavailable" : "No limit supplied");
    text("remainingLabel", hasLimit ? "Remaining in this " + budget.scope + " budget" : "Other budget scopes may still apply.");
    text("budgetSummary", hasLimit ? "Max budget: " + formatUsd(budget.maxBudget) + " · Spent: " + (hasSpend ? formatUsd(budget.spend) : "Unavailable") : "Recorded spend: " + (hasSpend ? formatUsd(budget.spend) : "Unavailable"));
    byId("budgetTrack").hidden = !hasLimit || budget.maxBudget === 0 || !hasSpend;
    byId("budgetBar").style.width = Math.min(100, Math.max(0, budget.budgetUtilizationPercent ?? 0)) + "%";
    byId("budgetTrack").classList.toggle("over", hasLimit && hasSpend && budget.spend >= budget.maxBudget);
    text("budgetMeta", "Next reset: " + resetLabel(budget.budgetResetAt) + (budget.status === "catalog" ? " · Catalog snapshot" : ""));
    byId("budgetScopes").replaceChildren();
    for (const entry of scopes.filter((value) => value !== budget)) {
      const node = document.createElement("div");
      node.className = "budget-scope";
      const title = document.createElement("strong");
      title.textContent = labels[entry.scope];
      const description = document.createElement("p");
      description.textContent = entry.status === "unavailable" ? "Lookup unavailable; no limit has been inferred." : configured(entry) ? "Max budget: " + formatUsd(entry.maxBudget) + " · Spent: " + (Number.isFinite(entry.spend) ? formatUsd(entry.spend) : "Unavailable") + " · Remaining: " + (Number.isFinite(entry.remainingBudget) ? formatUsd(entry.remainingBudget) : "Unavailable") + " · Reset: " + resetLabel(entry.budgetResetAt) : "No " + entry.scope + "-specific limit supplied.";
      node.append(title, description);
      byId("budgetScopes").append(node);
    }
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
