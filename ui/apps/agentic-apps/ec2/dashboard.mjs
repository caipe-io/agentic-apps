import { renderAgenticAppConversationClient } from "../../_lib/conversation-client.mjs";
import { renderMicrofrontendClient } from "../../_lib/microfrontend-client.mjs";
import { validateEc2Response } from "./inventory.mjs";

export function renderEc2Dashboard({ basePath, appPath, compact, configuration }) {
  const config = JSON.stringify({ basePath, appPath, configuration }).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EC2 Instances Dashboard</title><style>
  :root{color-scheme:dark;--bg:#080e1a;--surface:#101a2b;--text:#e2e8f0;--muted:#a2b3cc;--line:#293951;--track:#22314a;--accent:#67e8f9;--warning:#fcd34d;--error:#fecaca;font:calc(15px * var(--app-font-scale,1))/1.5 Inter,ui-sans-serif,system-ui,sans-serif;color:var(--text);background:var(--bg)}
  :root[data-caipe-theme=light]{color-scheme:light;--bg:#f7f9fc;--surface:#fff;--text:#15233a;--muted:#50627b;--line:#dce3ed;--track:#e3eaf1;--accent:#087a83;--warning:#925705;--error:#a82323}
  *{box-sizing:border-box}body{margin:0}main{max-width:1440px;margin:auto;padding:28px 24px 44px}h1,h2,h3,p{margin:0}h1{font-size:1.85rem;letter-spacing:-.03em}h2{font-size:1.12rem}h3{font-size:1rem}.muted,small{color:var(--muted)}.small,small{font-size:.82rem}.subtitle{margin:6px 0 22px;color:var(--muted)}.row{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}.actions,.controls{display:flex;align-items:end;gap:12px;flex-wrap:wrap}.controls{margin:18px 0 14px}label{display:grid;gap:5px;color:var(--muted);font-size:.82rem}input,select,button{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:10px 12px}button{cursor:pointer;font-size:.88rem}button:disabled{opacity:.5;cursor:default}button.primary{background:var(--accent);color:var(--bg);border-color:var(--accent);font-weight:600}:focus-visible{outline:2px solid var(--accent);outline-offset:3px}a{color:var(--accent)}input[type=search]{width:100%;min-width:240px}select{min-width:160px}.grow{flex:1}.panel{border:1px solid var(--line);background:var(--surface);border-radius:12px;padding:20px;margin:18px 0}.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:18px}.kpi{margin:0}.kpi strong{display:block;font-size:1.9rem;font-variant-numeric:tabular-nums;margin:5px 0}.charts{display:grid;grid-template-columns:1fr 1fr;gap:16px}.charts .panel{margin:0}.bars{display:grid;gap:12px;margin-top:18px}.bar-row{display:grid;grid-template-columns:minmax(100px,1fr) 2fr 40px;gap:12px;align-items:center;font-size:.85rem}.bar-track{height:10px;background:var(--track);border-radius:4px;overflow:hidden}.bar-track i{display:block;height:100%;background:var(--accent)}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:.85rem}th{text-align:left;color:var(--muted);font-size:.78rem;font-weight:500}td,th{padding:14px 10px;border-bottom:1px solid var(--line);vertical-align:top}table.inventory{min-width:1150px}.numeric{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.tag{display:inline-block;border:1px solid var(--line);border-radius:5px;padding:2px 6px;font-size:.75rem;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.state{display:inline-block;border:1px solid var(--line);border-radius:20px;padding:2px 8px;font-size:.78rem}.state.running{color:var(--accent)}.tag-stack{display:grid;gap:4px}.notice{margin:12px 0;color:var(--muted)}.error{color:var(--error)}.warning{color:var(--warning)}.empty{text-align:center;padding:35px;color:var(--muted)}.progress{border-color:var(--accent);background:var(--track)}.spinner{width:21px;height:21px;border:3px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;display:inline-block;flex-shrink:0}.progress-heading{justify-content:flex-start}.progress-heading strong{flex:1}.progress p{margin-top:8px}.progress.finished{padding:10px 16px;margin:10px 0}.progress.finished .progress-heading strong{font-size:.88rem}.progress.finished p{font-size:.78rem;margin-top:2px}.coverage-panel{padding:10px 16px!important;margin:12px 0}.coverage-panel details{margin:0}.detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:18px}.detail-grid strong{display:block;margin-top:4px}dl{display:grid;grid-template-columns:minmax(120px,1fr) 3fr;gap:10px 18px}dt,dd{margin:0;overflow-wrap:anywhere}details{margin-top:14px}summary{cursor:pointer;color:var(--muted)}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.8rem}.pagination{margin-top:16px}.scope-issues{display:grid;gap:8px;padding-left:20px}.selected-row{background:var(--track)}[hidden]{display:none!important}body.compact main{padding-top:18px}body.compact .panel{padding:16px}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.spinner{animation:none}}@media(max-width:850px){.kpis,.detail-grid{grid-template-columns:1fr 1fr}.charts{grid-template-columns:1fr}}@media(max-width:520px){main{padding:18px 12px}.kpis{grid-template-columns:1fr 1fr}.controls label{width:100%}.controls select{width:100%}.detail-grid{grid-template-columns:1fr}.bar-row{grid-template-columns:90px 1fr 30px}}@media(pointer:coarse){input,select,button{min-height:44px}}
  </style></head><body class="${compact ? "compact" : ""}"><main>
  <header class="row"><div><h1>EC2 instances</h1><p class="subtitle">Explore instance size, OS, tags, and cost by AWS account and region.</p></div><div class="actions"><button id="copyLink">Copy link</button><button id="refresh" disabled>Refresh data</button><button id="askAws">Ask AWS</button></div></header>
  <section class="panel" aria-labelledby="scopeTitle"><h2 id="scopeTitle">AWS account scope</h2><form id="scopeForm" class="controls"><label class="grow">Account / profile<select id="profile" required></select></label><label class="grow">Region<select id="region" required></select></label><button class="primary" id="load" type="submit">Load inventory</button></form><p class="muted small">Inventory is retrieved through AWS MCP. Choose an account and region to start; loading a page does not change AWS resources.</p></section>
  <section id="progress" class="panel progress" hidden><div class="row progress-heading"><span id="spinner" class="spinner" aria-hidden="true"></span><strong id="progressTitle" role="status" aria-live="polite"></strong><time id="elapsed" class="small muted"></time><button id="cancel">Cancel</button></div><p id="progressDetail" class="small muted"></p></section>
  <p id="status" class="notice small" role="status" aria-live="polite">Choose an account and load inventory.</p>
  <div id="content" hidden>
    <div class="kpis"><article class="panel kpi"><span class="muted small">Matching loaded instances</span><strong id="instanceCount">—</strong><small id="coverageCount"></small></article><article class="panel kpi"><span class="muted small">Running / stopped</span><strong id="stateCount">—</strong><small>In the current filters</small></article><article class="panel kpi"><span class="muted small">On-demand equivalent / mo</span><strong id="monthlyCost">—</strong><small id="priceCoverage"></small></article><article class="panel kpi"><span class="muted small">Accounts / regions loaded</span><strong id="scopeCount">—</strong><small>Successful scopes only</small></article></div>
    <p class="notice small"><em>Cost is a USD reference estimate: current on-demand hourly rate × 730 hours for running instances. It is not billed cost. Storage, networking, licenses beyond the selected SKU, Spot discounts, Reserved Instances, and Savings Plans are excluded. Missing prices remain unknown.</em></p>
    <section id="scopeProblems" class="panel coverage-panel" hidden><details id="coverageDetails"><summary id="coverageSummary">Account and region coverage</summary><ul id="scopeIssues" class="scope-issues small"></ul></details></section>
    <div class="charts"><section class="panel"><h2>Instance sizes</h2><div id="typeBars" class="bars" role="list" aria-label="Loaded instances by size"></div></section><section class="panel"><h2>Operating systems</h2><div id="osBars" class="bars" role="list" aria-label="Loaded instances by operating system"></div></section></div>
    <section class="panel" aria-labelledby="inventoryTitle"><div class="row"><h2 id="inventoryTitle">Instance inventory</h2><span id="freshness" class="muted small"></span></div><form id="filterForm" class="controls" role="search" autocomplete="off"><label class="grow">Search loaded instances<input id="search" name="inventory-filter" type="search" maxlength="256" placeholder="Instance ID, name, size, OS, tag, or account" autocomplete="off" data-1p-ignore data-lpignore="true" data-bwignore="true" spellcheck="false"></label><label>State<select id="stateFilter"><option value="all">All states</option><option>running</option><option>stopped</option><option>pending</option><option>stopping</option><option>shutting-down</option><option>terminated</option></select></label><label>Sort by<select id="sort"><option value="cost">Highest estimated cost</option><option value="name">Name A–Z</option><option value="size">Instance size</option><option value="launch">Newest launch</option></select></label></form><p class="small muted">Search, charts, and totals cover loaded AWS pages only. Load remaining pages to expand coverage. Tag search covers the tags currently loaded.</p><div class="table-wrap"><table class="inventory"><thead><tr><th scope="col">Name / instance</th><th scope="col">Account / profile</th><th scope="col">Region</th><th scope="col">Size</th><th scope="col">OS</th><th scope="col">State</th><th scope="col" class="numeric">USD / hour</th><th scope="col" class="numeric">Est. USD / mo</th><th scope="col">Tags</th><th scope="col">Details</th></tr></thead><tbody id="instanceRows"></tbody></table></div><nav class="row pagination" aria-label="Inventory pages"><span id="pageInfo" class="muted small"></span><div class="actions"><label>Rows<select id="pageSize"><option>10</option><option>25</option><option>50</option></select></label><button id="previous" disabled>Previous</button><button id="next" disabled>Next</button><button id="loadMore" hidden>Load next AWS pages</button></div></nav></section>
    <section id="instanceDetail" class="panel" hidden aria-labelledby="detailTitle"><div class="row"><h2 id="detailTitle">Instance details</h2><div class="actions"><button id="askInstance">Ask AWS about this instance</button><button id="closeDetail">Close</button></div></div><div id="detailFields" class="detail-grid"></div><div class="row controls"><h3>Tags</h3><button id="allTags">Load all tags</button></div><p id="tagStatus" class="notice small" role="status"></p><dl id="tags"></dl></section>
    <section class="panel"><details><summary>AWS MCP evidence and limitations</summary><div id="evidence"></div></details></section>
  </div><p id="assistantStatus" class="notice small" role="status"></p><footer class="small muted">Scope and permissions follow the configured AWS profiles and the signed-in agent authorization. OS version is shown only when reported by Systems Manager.</footer>
  </main>${renderMicrofrontendClient("ec2")}${renderAgenticAppConversationClient()}<script>(${initializeEc2Dashboard.toString()})(${config},${validateEc2Response.toString()});</script></body></html>`;
}

function initializeEc2Dashboard({ basePath, appPath, configuration }, validateResponse) {
  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
  const text = (id, value) => { byId(id).textContent = value; };
  const route = (path) => (basePath === "/" ? "" : basePath) + path;
  const money = (value) => value === null ? "Unknown" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 3 }).format(value);
  const monthly = (row) => row.state === "running" ? row.pricing ? row.pricing.hourlyUsd * 730 : null : ["stopped", "terminated"].includes(row.state) ? 0 : null;
  const key = (row) => row.accountId + ":" + row.region + ":" + row.instanceId;
  const state = { records: new Map(), scopes: new Map(), page: 1, selected: null, busy: false, hasSnapshot: false, mock: false };
  let controller;
  let timer;
  let tagController;
  let generation = 0;
  const initial = new URLSearchParams(location.search);
  const addOption = (select, value, label) => { const option = document.createElement("option"); option.value = value; option.textContent = label; select.append(option); };
  if (configuration.accounts.length > 1) {
    addOption(byId("profile"), "", "Choose an account");
    addOption(byId("profile"), "*", "All configured accounts");
  }
  for (const account of configuration.accounts) addOption(byId("profile"), account.profile || "@default", account.label || account.profile + (account.accountId ? " · " + account.accountId : ""));
  if (configuration.regions.length > 1) addOption(byId("region"), "*", "All configured regions");
  for (const region of configuration.regions) addOption(byId("region"), region, region);
  if ([...byId("profile").options].some((option) => option.value === initial.get("profile"))) byId("profile").value = initial.get("profile");
  if ([...byId("region").options].some((option) => option.value === initial.get("region"))) byId("region").value = initial.get("region");
  byId("search").value = initial.get("search") || "";
  if ([...byId("stateFilter").options].some((option) => option.value === initial.get("state"))) byId("stateFilter").value = initial.get("state");
  if ([...byId("sort").options].some((option) => option.value === initial.get("sort"))) byId("sort").value = initial.get("sort");

  function selectedScopes() {
    if (!byId("scopeForm").reportValidity()) return [];
    const profile = byId("profile").value;
    if (!profile && configuration.accounts.length > 1) return [];
    const accounts = profile === "*" ? configuration.accounts : configuration.accounts.filter((account) => (account.profile || "@default") === profile);
    const regions = byId("region").value === "*" ? configuration.regions : [byId("region").value];
    return accounts.flatMap((account) => regions.map((region) => ({ profile: account.profile, region, nextToken: null, status: "pending", pages: 0, warnings: [], evidence: [] })));
  }
  async function requestPlan(input, signal) {
    const response = await fetch(route("/api/inventory-request"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal });
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
    for (const id of ["load", "refresh", "loadMore"]) byId(id).disabled = value;
    byId("allTags").disabled = value;
    for (const button of byId("instanceRows").querySelectorAll("button")) button.disabled = value;
    byId("refresh").disabled = value || !state.hasSnapshot;
  }
  function cancel() {
    controller?.abort(); tagController?.abort(); generation += 1;
    setBusy(false);
    finishProgress("Canceled", "Stopped waiting in the browser. Agent work already started on the server may continue.");
    for (const scope of state.scopes.values()) if (["loading", "pending"].includes(scope.status)) scope.status = "canceled";
    text("tagStatus", "Tag loading canceled; select Load all tags to retry.");
    render();
  }
  async function loadInventory(more = false) {
    const scopes = more ? [...state.scopes.values()].filter((scope) => scope.nextToken || ["error", "canceled"].includes(scope.status)) : selectedScopes();
    if (!scopes.length) return;
    controller?.abort(); tagController?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const current = ++generation;
    if (!more) {
      state.records.clear(); state.scopes.clear(); state.selected = null; state.mock = false; state.page = 1;
      for (const scope of scopes) state.scopes.set(scope.profile + ":" + scope.region, scope);
      byId("instanceDetail").hidden = true;
    }
    state.hasSnapshot = true;
    setBusy(true);
    beginProgress("Loading EC2 inventory…", "Retrieving AWS evidence for " + scopes.length + " account/region scope(s). Each request loads up to ten instances.");
    const queue = [...scopes];
    let completed = 0;
    const worker = async () => {
      while (queue.length && !signal.aborted) {
        const scope = queue.shift();
        const cursor = scope.nextToken || "";
        scope.status = "loading";
        try {
          const plan = await requestPlan({ profile: scope.profile, region: scope.region, cursor }, signal);
          const result = await invokeAgenticApp({ agentId: plan.agentId, appId: "ec2", title: "EC2 instance inventory", message: plan.prompt, signal, clientContext: { dashboardKind: "ec2-inventory", scope: plan.scope, response_format: plan.responseFormat }, onProgress: (phase) => {
            if (signal.aborted || current !== generation) return;
            text("progressDetail", (phase === "creating_conversation" ? "Creating an authorized conversation" : phase === "invoking_agent" ? "Waiting for AWS MCP evidence through the EC2 agent" : "Validating returned AWS inventory") + " · " + (scope.profile || "default credentials") + " / " + scope.region + " · " + completed + "/" + scopes.length + " scopes completed. Individual tool progress is unavailable.");
          } });
          if (signal.aborted || current !== generation) return;
          if (result.structured_output_schema_id && result.structured_output_schema_id !== plan.responseFormat.schema_id) throw new Error("The agent returned a different response format.");
          const data = validateResponse(result.structured_output ?? result.content, plan);
          if (data.nextToken && (data.nextToken === cursor || scope.seenTokens?.has(data.nextToken))) throw new Error("AWS returned the same pagination token; remaining coverage is unknown.");
          scope.seenTokens ??= new Set();
          if (cursor) scope.seenTokens.add(cursor);
          for (const row of data.instances) state.records.set(key(row), row);
          scope.status = "ready"; scope.nextToken = data.nextToken; scope.pages += 1; scope.warnings = [...new Set([...scope.warnings, ...data.warnings])]; scope.evidence.push(...data.evidence); scope.accountId = data.accountId;
          scope.updatedAt = data.retrievedAt;
          state.mock ||= result.mock === true;
        } catch (error) {
          if (signal.aborted || current !== generation) return;
          scope.status = "error"; scope.error = error.message;
        }
        completed += 1; render();
      }
    };
    await Promise.all([worker(), worker()]);
    if (signal.aborted || current !== generation) return;
    setBusy(false); render();
    const errors = [...state.scopes.values()].filter((scope) => scope.status === "error").length;
    finishProgress(errors ? "Inventory loaded with unavailable scopes" : "Inventory page loaded", "Completed " + completed + " scope(s). " + (hasMore() ? "More AWS pages or failed scopes remain; use Load next AWS pages." : "All requested AWS pages are loaded."));
  }
  function hasMore() { return [...state.scopes.values()].some((scope) => scope.nextToken || ["error", "canceled"].includes(scope.status)); }
  function matchingRows() {
    const search = byId("search").value.trim().toLowerCase();
    const rows = [...state.records.values()].filter((row) => (byId("stateFilter").value === "all" || row.state === byId("stateFilter").value) && (!search || [row.instanceId, row.name, row.instanceType, row.platform, row.osVersion, row.profile, row.accountId, row.region, ...row.tags.flatMap((tag) => [tag.key, tag.value, tag.key + "=" + tag.value])].join(" ").toLowerCase().includes(search)));
    const sort = byId("sort").value;
    return rows.sort((a, b) => sort === "cost" ? (monthly(a) === null) - (monthly(b) === null) || (monthly(b) ?? 0) - (monthly(a) ?? 0) || a.instanceId.localeCompare(b.instanceId) : sort === "size" ? a.instanceType.localeCompare(b.instanceType) : sort === "launch" ? String(b.launchTime || "").localeCompare(a.launchTime || "") : String(a.name || a.instanceId).localeCompare(String(b.name || b.instanceId)));
  }
  function bars(id, rows, field) {
    const groups = new Map();
    for (const row of rows) { const label = row[field] || "Unknown"; groups.set(label, (groups.get(label) || 0) + 1); }
    const sorted = [...groups].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const values = sorted.length > 7 ? [...sorted.slice(0, 6), ["Other", sorted.slice(6).reduce((sum, entry) => sum + entry[1], 0)]] : sorted;
    const maximum = Math.max(1, ...values.map((entry) => entry[1]));
    byId(id).innerHTML = values.length ? values.map(([label, count]) => '<div class="bar-row" role="listitem"><span>' + escapeHtml(label) + '</span><div class="bar-track" aria-hidden="true"><i style="width:' + count / maximum * 100 + '%"></i></div><strong class="numeric">' + count + '</strong></div>').join("") : '<p class="muted small">No matching instances in loaded pages.</p>';
  }
  function render() {
    byId("content").hidden = !state.hasSnapshot;
    const scopes = [...state.scopes.values()];
    const loaded = scopes.filter((scope) => scope.pages > 0);
    const issues = scopes.flatMap((scope) => [...(["error", "canceled", "loading", "pending"].includes(scope.status) ? [scope.status === "error" ? scope.error : scope.status + "; coverage is not complete."] : []), ...(scope.nextToken ? ["More AWS pages remain."] : []), ...scope.warnings].map((issue) => (scope.profile || "Default credentials") + " / " + scope.region + ": " + issue));
    byId("scopeProblems").hidden = !issues.length;
    const failed = scopes.filter((scope) => ["error", "canceled"].includes(scope.status)).length;
    text("coverageSummary", "Coverage: " + loaded.length + "/" + scopes.length + " account/region scopes loaded · " + scopes.filter((scope) => scope.nextToken).length + " with more AWS pages" + (failed ? " · " + failed + " unavailable" : "") + " · details");
    if (failed) byId("coverageDetails").open = true;
    byId("scopeIssues").innerHTML = issues.map((issue) => '<li>' + escapeHtml(issue) + '</li>').join("");
    const rows = matchingRows();
    const known = rows.filter((row) => row.state === "running" && row.pricing);
    const running = rows.filter((row) => row.state === "running");
    text("instanceCount", rows.length);
    text("coverageCount", state.records.size + " instances loaded · " + (hasMore() || scopes.some((scope) => scope.status !== "ready") ? "Partial AWS coverage" : "Complete requested scope"));
    text("stateCount", running.length + " / " + rows.filter((row) => row.state === "stopped").length);
    text("monthlyCost", known.length ? money(known.reduce((sum, row) => sum + monthly(row), 0)) : running.length ? "Unknown" : loaded.length ? money(0) : "Unknown");
    text("priceCoverage", known.length + "/" + running.length + " running instances priced" + (known.length < running.length ? " · partial estimate" : ""));
    text("scopeCount", new Set(loaded.map((scope) => scope.accountId)).size + " / " + new Set(loaded.map((scope) => scope.region)).size);
    text("status", (state.mock ? "Mock data · local preview. " : "") + (loaded.length ? "Loaded " + state.records.size + " instances from " + loaded.length + " account/region scope(s)." : "No successful inventory pages yet; AWS coverage is unknown."));
    const dates = [...state.records.values()].map((row) => Date.parse(row.retrievedAt)).filter(Number.isFinite);
    text("freshness", dates.length ? "Oldest record updated " + new Date(Math.min(...dates)).toLocaleString() : "");
    bars("typeBars", rows, "instanceType"); bars("osBars", rows, "platform");
    const size = Number(byId("pageSize").value); const pages = Math.max(1, Math.ceil(rows.length / size)); state.page = Math.max(1, Math.min(state.page, pages));
    byId("instanceRows").innerHTML = rows.slice((state.page - 1) * size, state.page * size).map((row) => '<tr' + (state.selected === key(row) ? ' class="selected-row"' : '') + '><td><strong>' + escapeHtml(row.name || "Unnamed instance") + '</strong><div class="muted small">' + escapeHtml(row.instanceId) + '</div></td><td>' + escapeHtml(row.accountId) + '<div class="muted small">' + escapeHtml(row.profile || "Default credentials") + '</div></td><td>' + escapeHtml(row.region) + '</td><td>' + escapeHtml(row.instanceType) + '<div class="muted small">' + (row.vcpu === null ? "vCPU unknown" : row.vcpu + ' vCPU') + ' · ' + (row.memoryGiB === null ? 'RAM unknown' : row.memoryGiB + ' GiB') + '</div></td><td>' + escapeHtml(row.osVersion || row.platform || "Unknown") + '<div class="muted small">' + escapeHtml(row.architecture || "Architecture unknown") + '</div></td><td><span class="state ' + (row.state === 'running' ? 'running' : '') + '">' + escapeHtml(row.state) + '</span>' + (row.lifecycle ? '<div class="muted small">' + escapeHtml(row.lifecycle) + '</div>' : '') + '</td><td class="numeric">' + money(row.pricing?.hourlyUsd ?? null) + '</td><td class="numeric">' + money(monthly(row)) + '</td><td><div class="tag-stack">' + row.tags.slice(0, 2).map((tag) => '<span class="tag" title="' + escapeHtml(tag.key + '=' + tag.value) + '">' + escapeHtml(tag.key + '=' + tag.value) + '</span>').join('') + '<small>' + row.tagCount + ' tags</small></div></td><td><button data-instance="' + escapeHtml(key(row)) + '">View details</button></td></tr>').join("") || '<tr><td colspan="10" class="empty">' + (loaded.length ? 'No matching instances in loaded pages.' : 'Inventory unavailable; review scope errors above.') + '</td></tr>';
    for (const button of byId("instanceRows").querySelectorAll("button")) button.disabled = state.busy;
    text("loadMore", scopes.some((scope) => scope.nextToken) ? "Load next AWS pages" : "Retry unavailable scopes");
    text("pageInfo", rows.length ? "Showing " + ((state.page - 1) * size + 1) + "–" + Math.min(state.page * size, rows.length) + " of " + rows.length + " · Page " + state.page + " of " + pages : "0 matching loaded instances");
    byId("previous").disabled = state.page <= 1; byId("next").disabled = state.page >= pages; byId("loadMore").hidden = !hasMore();
    byId("evidence").innerHTML = loaded.map((scope) => '<h3>' + escapeHtml((scope.profile || "Default credentials") + " / " + scope.region) + '</h3><p class="muted small">' + scope.pages + ' AWS page(s) · ' + escapeHtml(scope.updatedAt) + '</p>' + scope.evidence.map((entry) => '<pre>' + escapeHtml(entry.tool + ' · ' + entry.profile + ' · ' + entry.region + '\n' + entry.command) + '</pre>').join('')).join("");
    publishContext();
  }
  function showDetail(id) {
    if (state.busy) return;
    tagController?.abort(); state.selected = id;
    const row = state.records.get(id); if (!row) return;
    byId("instanceDetail").hidden = false; text("detailTitle", row.name || row.instanceId);
    const fields = [["Instance", row.instanceId], ["Account / profile", row.accountId + " / " + (row.profile || "Default credentials")], ["Region", row.region], ["Size", row.instanceType + " · " + (row.vcpu ?? "?") + " vCPU · " + (row.memoryGiB ?? "?") + " GiB"], ["OS", row.osVersion || row.platform || "Unknown"], ["Architecture / tenancy", (row.architecture || "Unknown") + " / " + (row.tenancy || "Unknown")], ["State", row.state], ["Launched", row.launchTime ? new Date(row.launchTime).toLocaleString() : "Unknown"], ["Price evidence", row.pricing ? "AWS Price List SKU " + row.pricing.sku + " · " + money(row.pricing.hourlyUsd) + "/hour" : "AWS pricing unavailable"]];
    byId("detailFields").innerHTML = fields.map(([label, value]) => '<div><span class="muted small">' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>').join("");
    renderTags(row); render(); byId("instanceDetail").scrollIntoView({ block: "nearest" });
  }
  function renderTags(row) {
    text("tagStatus", row.tags.length + " of " + row.tagCount + " reported tags loaded." + (row.tagsRetrievedAt ? " Updated " + new Date(row.tagsRetrievedAt).toLocaleString() + "." : ""));
    byId("allTags").hidden = row.tags.length >= row.tagCount;
    byId("tags").innerHTML = row.tags.map((tag) => '<dt>' + escapeHtml(tag.key) + '</dt><dd>' + escapeHtml(tag.value) + '</dd>').join("") || '<dt class="muted">No tags reported</dt><dd></dd>';
  }
  async function loadTags() {
    const row = state.records.get(state.selected); if (!row || state.busy) return;
    tagController?.abort(); tagController = new AbortController(); const signal = tagController.signal; const id = state.selected;
    setBusy(true); beginProgress("Loading instance tags…", row.instanceId + " · " + row.region);
    try {
      const plan = await requestPlan({ kind: "tags", profile: row.profile, region: row.region, instanceId: row.instanceId }, signal);
      const result = await invokeAgenticApp({ agentId: plan.agentId, appId: "ec2", title: "EC2 instance tags", message: plan.prompt, signal, clientContext: { dashboardKind: "ec2-tags", scope: plan.scope, response_format: plan.responseFormat } });
      if (signal.aborted || state.selected !== id) return;
      if (result.structured_output_schema_id && result.structured_output_schema_id !== plan.responseFormat.schema_id) throw new Error("The agent returned a different response format.");
      const data = validateResponse(result.structured_output ?? result.content, plan);
      row.tags = data.tags; row.tagCount = data.tags.length; row.tagsRetrievedAt = data.retrievedAt; row.tagEvidence = data.evidence; renderTags(row); render();
      finishProgress("Instance tags loaded", data.tags.length + " tags retrieved through AWS MCP.");
    } catch (error) { if (!signal.aborted) { text("tagStatus", error.message); finishProgress("Tag lookup failed", error.message); } }
    finally { if (!signal.aborted) setBusy(false); }
  }
  function publishContext() {
    const selected = state.records.get(state.selected);
    const selection = { requestedScope: { profile: byId("profile").value === "@default" ? "" : byId("profile").value, region: byId("region").value }, configuredAccounts: configuration.accounts.slice(0, 12), configuredRegions: configuration.regions.slice(0, 12), scopeCount: state.scopes.size, scopes: [...state.scopes.values()].slice(0, 12).map((scope) => ({ profile: scope.profile, accountId: scope.accountId, region: scope.region, status: scope.status, morePages: Boolean(scope.nextToken) })), filters: { search: byId("search").value.slice(0, 256), state: byId("stateFilter").value }, loadedInstances: state.records.size, selectedInstance: selected ? { instanceId: selected.instanceId, profile: selected.profile, accountId: selected.accountId, region: selected.region, instanceType: selected.instanceType, state: selected.state } : null, mock: state.mock };
    window.parent?.postMessage({ type: "caipe.agenticApp.context.v1", version: "1.0", appId: "ec2", context: { route: appPath, title: "EC2 instances", agentId: configuration.agentId, mcpServerId: "mcp-aws", domainAnswersRequireMcp: true, summary: "EC2 inventory for the selected AWS profiles and regions. " + state.records.size + " instances in loaded pages. Pricing is an on-demand reference estimate, not billed cost.", selection: JSON.stringify(selection), resourceRefs: [{ kind: "agent", id: configuration.agentId }, { kind: "mcp-server", id: "mcp-aws" }], suggestedPrompts: selected ? ["Use AWS MCP to show all tags and OS details for " + selected.instanceId + " in profile " + selected.profile + ", region " + selected.region + ".", "Compare current pricing and actual billing evidence for this instance, stating unavailable data."] : ["Which instances in the selected account scope should I investigate for cost savings?", "Compare instance sizes and OS versions using current AWS evidence."] } }, window.location.origin);
  }
  function openAssistant() { publishContext(); if (window.parent === window) { text("assistantStatus", "Ask AWS is available inside the platform host, using the dedicated EC2 agent and AWS MCP."); return; } window.parent?.postMessage({ type: "caipe.agenticApp.assistant.open.v1", version: "1.0", appId: "ec2" }, window.location.origin); text("assistantStatus", "Opened Ask AWS with the selected account, region, and instance context."); }
  byId("scopeForm").addEventListener("submit", (event) => { event.preventDefault(); loadInventory(); });
  for (const id of ["profile", "region"]) byId(id).addEventListener("change", () => { if (state.busy) cancel(); state.records.clear(); state.scopes.clear(); state.selected = null; state.hasSnapshot = false; byId("content").hidden = true; byId("scopeProblems").hidden = true; byId("progress").hidden = true; byId("refresh").disabled = true; text("status", "Scope changed. Select Load inventory to retrieve AWS evidence."); publishContext(); });
  byId("refresh").addEventListener("click", () => loadInventory()); byId("loadMore").addEventListener("click", () => loadInventory(true)); byId("cancel").addEventListener("click", cancel);
  byId("filterForm").addEventListener("submit", (event) => event.preventDefault());
  for (const id of ["search", "stateFilter", "sort", "pageSize"]) byId(id).addEventListener(id === "search" ? "input" : "change", () => { state.page = 1; render(); });
  byId("previous").addEventListener("click", () => { state.page -= 1; render(); }); byId("next").addEventListener("click", () => { state.page += 1; render(); });
  byId("instanceRows").addEventListener("click", (event) => { const button = event.target.closest("button[data-instance]"); if (button) showDetail(button.dataset.instance); });
  byId("allTags").addEventListener("click", loadTags); byId("closeDetail").addEventListener("click", () => { if (state.busy && tagController && !tagController.signal.aborted) cancel(); tagController?.abort(); byId("instanceDetail").hidden = true; state.selected = null; publishContext(); });
  byId("askAws").addEventListener("click", openAssistant); byId("askInstance").addEventListener("click", openAssistant);
  byId("copyLink").addEventListener("click", async () => { const url = new URL(appPath, location.origin); for (const [name, id] of [["profile", "profile"], ["region", "region"], ["search", "search"], ["state", "stateFilter"], ["sort", "sort"]]) if (byId(id).value) url.searchParams.set(name, byId(id).value); try { await navigator.clipboard.writeText(url.toString()); text("status", "Link copied. Recipients need their own app and AWS access; data is loaded on request."); } catch { text("status", "Share this view: " + url.toString()); } });
  window.addEventListener("caipe:microfrontend-initialize", publishContext);
  publishContext();
}
