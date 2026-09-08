#!/usr/bin/env node

import { createServer } from "node:http";

import { handleAppMcpRequest } from "../../_lib/app-mcp-server.mjs";
import { createRequiredAgenticAppJwtVerifier } from "../../_lib/jwt-verify.mjs";
import { renderMicrofrontendClient } from "../../_lib/microfrontend-client.mjs";
import { authorizeAgenticAppRuntimeRequest } from "../../_lib/runtime-authorization.mjs";
import {
  resolveAgenticAppRuntimeBasePath,
  resolveAgenticAppSurface,
} from "../../_lib/runtime-base-path.mjs";
import { renderStaticDashboardExample } from "../../_lib/static-dashboard-examples.mjs";
import { registerLiteLlmMcpTools } from "./mcp.mjs";
import { sanitizeLiteLlmModelInfo } from "./model-info.mjs";
import {
  buildLiteLlmVirtualKeyListQuery,
  buildLiteLlmUsageDashboard,
  prepareLiteLlmVirtualKeys,
  resolveLiteLlmUsageRange,
} from "./usage.mjs";

const port = Number(process.env.LITELLM_APP_PORT ?? "3042");
const configuredBasePath = normalizeBasePath(
  process.env.LITELLM_APP_BASE_PATH ?? "/apps/litellm",
);
const agentId = String(process.env.LITELLM_AGENT_ID ?? "agent-litellm").trim();
const litellmApiUrl = String(process.env.LITELLM_API_URL ?? "").replace(/\/+$/, "");
const litellmApiToken = String(
  process.env.LITELLM_API_KEY ?? process.env.LITELLM_TOKEN ?? process.env.LITELLM_API_TOKEN ?? "",
).trim();
const litellmApiTimeoutMs = Math.max(5_000, Number(process.env.LITELLM_API_TIMEOUT ?? "30") * 1000);
const verifier = createRequiredAgenticAppJwtVerifier({
  appId: "litellm",
  disabled: process.env.AGENTIC_APP_LITELLM_JWT_DISABLED === "true",
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const basePath = resolveAgenticAppRuntimeBasePath(request.headers, configuredBasePath, "litellm");
  const surface = resolveAgenticAppSurface(request.headers);

  if (["/health/live", "/health/ready", "/healthz"].includes(url.pathname)) {
    sendJson(response, 200, {
      ok: true,
      app: "litellm",
      runtime: "separate-process",
      dataSource: "litellm-api-with-mcp-backed-chat",
      agentId,
      mcp: { endpoint: "/mcp", authentication: "forwarded-bearer" },
      upstreamConfigured: Boolean(litellmApiUrl && litellmApiToken),
    });
    return;
  }

  if (url.pathname === "/mcp") {
    await handleAppMcpRequest(request, response, {
      name: "litellm-app",
      authenticationDisabled: process.env.AGENTIC_APP_LITELLM_MCP_AUTH_DISABLED === "true",
      registerTools(mcpServer) {
        registerLiteLlmMcpTools(mcpServer, {
          getDailyActivity: getLiteLlmDailyActivity,
          getModelInfo: getLiteLlmModelInfo,
        });
      },
    });
    return;
  }

  if (verifier) {
    const result = await verifier(request.headers);
    if (!result.ok) {
      sendJson(response, result.status, { error: "unauthorized", reason: result.reason });
      return;
    }
    request.caipeIdentity = result.identity;
  }
  const authorization = authorizeAgenticAppRuntimeRequest({
    identity: request.caipeIdentity,
    appId: "litellm",
    method: request.method,
    readScope: "litellm:read",
    invokeScope: "litellm:agent:invoke",
    allowDevelopmentBypass: verifier === null,
  });
  if (!authorization.ok) {
    sendJson(response, authorization.status, {
      error: authorization.error,
      requiredScope: authorization.requiredScope,
    });
    return;
  }

  if (url.pathname === "/api/context" && request.method === "GET") {
    sendJson(response, 200, {
      version: "1.0",
      appId: "litellm",
      route: "/apps/litellm",
      title: "LiteLLM Usage Dashboard",
      agentId,
      mcpServerId: "litellm",
      domainAnswersRequireMcp: true,
      suggestedPrompts: [
        "Explain the biggest LiteLLM spend and token drivers.",
        "Which users or models should we investigate first?",
        "Create a safe plan to reduce LLM spend.",
      ],
    });
    return;
  }

  if (url.pathname === "/api/virtual-keys" && request.method === "GET") {
    try {
      const keys = await getLiteLlmVirtualKeys();
      sendJson(response, 200, { success: true, keys: keys.map((key) => key.public) });
    } catch (error) {
      sendJson(response, 502, {
        success: false,
        error: error instanceof Error ? error.message : "Could not load LiteLLM virtual keys",
      });
    }
    return;
  }

  if (url.pathname === "/api/usage" && request.method === "GET") {
    try {
      const report = await getLiteLlmVirtualKeyUsage({
        keyId: url.searchParams.get("key"),
        period: url.searchParams.get("period"),
      });
      sendJson(response, 200, { success: true, data: report });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load LiteLLM usage";
      sendJson(response, message === "Virtual key not found" ? 404 : 502, { success: false, error: message });
    }
    return;
  }

  if (url.pathname === "/example") {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(renderStaticDashboardExample("litellm", authorization.summary));
    return;
  }

  if (url.pathname === "/" || url.pathname === "/dashboard") {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(
      renderDashboard({
        compact: surface === "hosted",
        basePath,
        appPath: configuredBasePath,
      }),
    );
    return;
  }

  sendJson(response, 404, { error: "not_found" });
});

server.listen(port, () => {
  console.log(`LiteLLM Usage Dashboard listening on http://localhost:${port}`);
  console.log(`Configure CAIPE with AGENTIC_APP_LITELLM_ORIGIN=http://localhost:${port}`);
});

async function getLiteLlmDailyActivity({ startDate, endDate }) {
  return fetchLiteLlmJson("/user/daily/activity/aggregated", { start_date: startDate, end_date: endDate });
}

async function getLiteLlmModelInfo() {
  return sanitizeLiteLlmModelInfo(await fetchLiteLlmJson("/model/info"));
}

async function getLiteLlmVirtualKeys() {
  const payload = await fetchLiteLlmJson(
    "/key/list",
    buildLiteLlmVirtualKeyListQuery(),
  );
  return prepareLiteLlmVirtualKeys(payload);
}

async function getLiteLlmVirtualKeyUsage({ keyId, period }) {
  const keys = await getLiteLlmVirtualKeys();
  const key = keys.find((candidate) => candidate.public.id === keyId);
  if (!key) throw new Error("Virtual key not found");
  const range = resolveLiteLlmUsageRange(period);
  const responses = [];
  for (const segment of range.segments) {
    responses.push(await fetchLiteLlmJson("/user/daily/activity/aggregated", {
      start_date: segment.startDate,
      end_date: segment.endDate,
      api_key: key.upstreamKey,
    }));
  }
  return buildLiteLlmUsageDashboard({ key, range, responses });
}

async function fetchLiteLlmJson(pathname, query = {}) {
  if (!litellmApiUrl || !litellmApiToken) {
    throw new Error("LiteLLM integration is not configured");
  }
  const url = new URL(`${litellmApiUrl}${pathname}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), litellmApiTimeoutMs);
  try {
    const upstreamResponse = await fetch(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${litellmApiToken}`,
      },
      signal: controller.signal,
    });
    if (!upstreamResponse.ok) {
      throw new Error(`LiteLLM request failed with status ${upstreamResponse.status}`);
    }
    return await upstreamResponse.json();
  } finally {
    clearTimeout(timeout);
  }
}

function renderDashboard({ compact, basePath, appPath }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LiteLLM Usage Dashboard</title>
    <style>
      :root {
        color-scheme: dark;
        --app-font-scale: 1;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: calc(16px * var(--app-font-scale));
        line-height: 1.5;
        color: #e2e8f0;
        background: #030712;
        --panel: rgba(15, 23, 42, 0.78);
        --line: rgba(148, 163, 184, 0.18);
        --muted: #9fb0c8;
        --cyan: #67e8f9;
        --green: #6ee7b7;
        --amber: #fcd34d;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at 12% 8%, rgba(14, 165, 233, 0.20), transparent 30rem),
          radial-gradient(circle at 86% 12%, rgba(45, 212, 191, 0.14), transparent 28rem),
          #030712;
      }
      main { width: min(1380px, calc(100% - 32px)); margin: 0 auto; padding: ${compact ? "18px 0 42px" : "28px 0 52px"}; }
      .hero, .panel, .kpi { border: 1px solid var(--line); background: var(--panel); box-shadow: 0 20px 60px rgba(2, 6, 23, .28); }
      .hero { padding: 22px; border-radius: 20px; }
      .hero-row { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
      .eyebrow { margin: 0 0 5px; color: var(--cyan); font-size: .76rem; font-weight: 850; letter-spacing: .16em; text-transform: uppercase; }
      h1 { margin: 0; color: #f8fafc; font-size: clamp(1.8rem, 3.2vw, 3rem); line-height: 1.1; letter-spacing: -.035em; }
      h2 { margin: 0 0 14px; color: #f8fafc; font-size: 1.05rem; }
      .subtitle { margin: 10px 0 0; max-width: 760px; color: var(--muted); font-size: .98rem; }
      .example-link { display: inline-flex; margin-top: 12px; color: #7dd3fc; font-size: .86rem; font-weight: 800; text-decoration: none; }
      .example-link:hover { text-decoration: underline; }
      .source-badge { display: inline-flex; gap: 8px; align-items: center; border: 1px solid rgba(103,232,249,.28); border-radius: 999px; padding: 7px 11px; color: #cffafe; background: rgba(8,145,178,.12); font-size: .78rem; font-weight: 750; }
      .source-badge i { width: 8px; height: 8px; border-radius: 999px; background: var(--green); box-shadow: 0 0 14px rgba(110,231,183,.7); }
      .controls { display: flex; align-items: end; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
      label { display: grid; gap: 5px; color: var(--muted); font-size: .76rem; font-weight: 750; text-transform: uppercase; letter-spacing: .07em; }
      select, button { min-height: 42px; border-radius: 10px; border: 1px solid var(--line); padding: 9px 12px; font: inherit; }
      select { min-width: 190px; color: #e2e8f0; background: #07111f; }
      button { cursor: pointer; border: 0; color: #04111d; background: linear-gradient(135deg, #38bdf8, #34d399); font-weight: 800; }
      button:disabled { cursor: wait; opacity: .6; }
      button.ghost { color: #dbeafe; background: rgba(15,23,42,.78); border: 1px solid var(--line); }
      :is(a, button, select):focus-visible { outline: 3px solid rgba(103, 232, 249, 0.78); outline-offset: 2px; }
      .status { margin-left: auto; align-self: center; color: var(--muted); font-size: .85rem; }
      .status strong { color: #e2e8f0; }
      .kpis { display: grid; grid-template-columns: repeat(6, minmax(0,1fr)); gap: 12px; margin: 14px 0; }
      .kpi { min-height: 126px; padding: 16px; border-radius: 16px; }
      .kpi span { color: var(--muted); font-size: .74rem; font-weight: 800; text-transform: uppercase; letter-spacing: .09em; }
      .kpi strong { display: block; margin: 8px 0 3px; color: #f8fafc; font-size: 1.72rem; line-height: 1.05; }
      .kpi small { color: #8da1bc; }
      .layout { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(320px, .6fr); gap: 14px; }
      .panel { padding: 18px; border-radius: 18px; min-width: 0; }
      .stack { display: grid; gap: 14px; }
      .bars { display: grid; gap: 13px; }
      .bar { display: grid; grid-template-columns: minmax(120px, .7fr) minmax(150px, 1.3fr) auto; gap: 12px; align-items: center; }
      .bar-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #dbeafe; font-weight: 700; }
      .track { height: 12px; border-radius: 999px; background: #102139; overflow: hidden; }
      .track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #38bdf8, #34d399); }
      .bar-value { color: #cbd5e1; font-variant-numeric: tabular-nums; }
      .budget-meter { height: 14px; margin: 12px 0 8px; overflow: hidden; border-radius: 999px; background: #102139; }
      .budget-meter i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #34d399, #fcd34d); }
      .key-meta { display: grid; gap: 8px; color: #cbd5e1; font-size: .86rem; }
      .key-meta strong { color: #f8fafc; }
      .empty { padding: 28px 18px; border: 1px dashed var(--line); border-radius: 14px; color: var(--muted); text-align: center; }
      .notice { margin: 14px 0 0; padding: 12px 14px; border: 1px solid rgba(252,211,77,.25); border-radius: 12px; background: rgba(120,53,15,.12); color: #fde68a; }
      .notice.error { border-color: rgba(248,113,113,.35); background: rgba(127,29,29,.14); color: #fecaca; }
      ul { margin: 0; padding-left: 20px; color: #cbd5e1; }
      li + li { margin-top: 10px; }
      .table-wrap { overflow: auto; margin-top: 14px; }
      table { width: 100%; border-collapse: collapse; min-width: 720px; }
      th, td { padding: 11px 10px; border-bottom: 1px solid var(--line); text-align: right; }
      th:first-child, td:first-child { text-align: left; }
      th { color: var(--muted); font-size: .73rem; text-transform: uppercase; letter-spacing: .08em; }
      td { color: #dbeafe; font-size: .9rem; }
      footer { margin-top: 14px; color: #7f93ad; font-size: .78rem; }
      body.compact main { width: min(1380px, calc(100% - 24px)); }
      body.compact .hero, body.compact .panel { padding: 15px; }
      @media (max-width: 1050px) { .kpis { grid-template-columns: repeat(3, minmax(0,1fr)); } .layout { grid-template-columns: 1fr; } }
      @media (max-width: 680px) { main { width: min(100% - 20px, 1380px); } .kpis { grid-template-columns: repeat(2, minmax(0,1fr)); } .controls > * { width: 100%; } select { width: 100%; } .status { margin-left: 0; } .bar { grid-template-columns: 1fr; gap: 5px; } }
      @media (max-width: 460px) { .kpis { grid-template-columns: 1fr; } }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; } }
    </style>
  </head>
  <body>
    <main>
      <header class="hero">
        <div class="hero-row">
          <div>
            <p class="eyebrow">LiteLLM · MCP-backed operations</p>
            <h1>Usage, spend, and model efficiency</h1>
            <p class="subtitle">Live LiteLLM spend, tokens, requests, trends, and budget status for an authorized virtual key. Chat uses the dedicated LiteLLM agent and LiteLLM MCP.</p>
            <a class="example-link" href="${basePath}/example">View static example</a>
          </div>
          <span class="source-badge"><i></i> Live LiteLLM usage</span>
        </div>
        <div class="controls">
          <label>Virtual key
            <select id="virtualKey" disabled>
              <option value="">Loading authorized keys…</option>
            </select>
          </label>
          <label>Usage period
            <select id="period">
              <option value="current">Today</option>
              <option value="month" selected>Current month</option>
              <option value="3m">Last 3 months</option>
              <option value="6m">Last 6 months</option>
              <option value="12m">Last 12 months</option>
            </select>
          </label>
          <button id="refresh" disabled>Refresh usage</button>
          <button id="openAssistant" class="ghost">Open Ask LiteLLM</button>
          <span class="status" id="status" role="status" aria-live="polite"><strong>Ready</strong> · no live report loaded</span>
        </div>
        <div class="notice" id="notice" role="status" aria-live="polite">Loading authorized virtual keys from LiteLLM. Raw key material is never sent to the browser.</div>
      </header>

      <section class="kpis" aria-label="LiteLLM key metrics">
        <article class="kpi"><span>Period spend</span><strong id="spend">—</strong><small>USD in selected period</small></article>
        <article class="kpi"><span>Total tokens</span><strong id="tokens">—</strong><small>Input and output tokens</small></article>
        <article class="kpi"><span>Requests</span><strong id="requests">—</strong><small>Completed requests</small></article>
        <article class="kpi"><span>Budget</span><strong id="budget">—</strong><small>Configured key limit</small></article>
        <article class="kpi"><span>Budget used</span><strong id="budgetUsed">—</strong><small>Lifetime/reset-period spend</small></article>
        <article class="kpi"><span>Remaining</span><strong id="budgetRemaining">—</strong><small>Before configured limit</small></article>
      </section>

      <div class="layout">
        <section class="panel">
          <h2 id="chartTitle">Usage trend</h2>
          <div id="bars" class="empty">Select a virtual key to load its current usage trend.</div>
        </section>
        <div class="stack">
          <section class="panel">
            <h2>Virtual-key budget</h2>
            <div class="budget-meter" aria-label="Budget utilization"><i id="budgetBar" style="width:0%"></i></div>
            <div class="key-meta" id="keyMeta">No key selected.</div>
          </section>
          <section class="panel">
            <h2>Source and freshness</h2>
            <p id="freshness" class="subtitle">Source: LiteLLM API. Freshness: not loaded.</p>
          </section>
        </div>
      </div>

      <section class="panel" style="margin-top:14px">
        <h2>Model usage for selected virtual key</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Model</th><th>Spend</th><th>Tokens</th><th>Requests</th><th>Spend share</th></tr></thead>
            <tbody id="rows"><tr><td colspan="5" style="text-align:center;color:#9fb0c8">No live rows loaded.</td></tr></tbody>
          </table>
        </div>
      </section>
      <footer>Dashboard reads use the app's LiteLLM integration; contextual chat uses the dedicated LiteLLM MCP agent. Agent ID: ${escapeHtml(agentId)}.</footer>
    </main>

    ${renderMicrofrontendClient("litellm")}
    <script>
      const configuredAgentId = ${JSON.stringify(agentId)};
      const basePath = ${JSON.stringify(basePath)};
      const appPath = ${JSON.stringify(appPath)};
      const state = { report: null, keys: [] };

      document.getElementById("refresh").addEventListener("click", runReport);
      document.getElementById("virtualKey").addEventListener("change", runReport);
      document.getElementById("period").addEventListener("change", runReport);
      document.getElementById("openAssistant").addEventListener("click", openAssistant);
      window.addEventListener("caipe:microfrontend-initialize", (event) => {
        const preferredRange = event.detail?.preferences?.defaultRange;
        const rangeByPreference = { "7d": "current", "30d": "month", "90d": "3m" };
        if (rangeByPreference[preferredRange]) {
          document.getElementById("period").value = rangeByPreference[preferredRange];
        }
      });

      async function loadVirtualKeys() {
        const select = document.getElementById("virtualKey");
        try {
          const response = await fetch(appRoute("/api/virtual-keys"), {
            credentials: "same-origin",
            headers: { accept: "application/json" },
          });
          const payload = await response.json();
          if (!response.ok || payload.success === false) throw new Error(payload.error || "Could not load virtual keys");
          state.keys = Array.isArray(payload.keys) ? payload.keys : [];
          if (!state.keys.length) throw new Error("No authorized LiteLLM virtual keys were returned");
          select.innerHTML = state.keys.map((key) => '<option value="' + escapeHtml(key.id) + '">' + escapeHtml(key.label + " · " + key.owner) + '</option>').join("");
          select.disabled = false;
          document.getElementById("refresh").disabled = false;
          await runReport();
        } catch (error) {
          select.innerHTML = '<option value="">No keys available</option>';
          setStatus("Needs attention", "virtual keys unavailable");
          setNotice(error instanceof Error ? error.message : String(error), true);
        }
      }

      async function runReport() {
        const button = document.getElementById("refresh");
        const keyId = document.getElementById("virtualKey").value;
        const period = document.getElementById("period").value;
        if (!keyId) return;
        setStatus("Loading", "querying LiteLLM usage");
        setNotice("Loading live usage for the selected virtual key. The server keeps upstream key material private.", false);
        button.disabled = true;
        try {
          const response = await fetch(appRoute("/api/usage") + "?key=" + encodeURIComponent(keyId) + "&period=" + encodeURIComponent(period), {
            credentials: "same-origin",
            headers: { accept: "application/json" },
          });
          const payload = await response.json();
          if (!response.ok || payload.success === false) throw new Error(payload.error || "LiteLLM usage request failed");
          state.report = payload.data;
          renderReport(state.report);
          publishContext(state.report);
          setStatus("Updated", new Date().toLocaleTimeString());
          setNotice("Live LiteLLM usage loaded for " + state.report.virtualKey.label + ".", false);
        } catch (error) {
          setStatus("Needs attention", "usage unavailable");
          setNotice(error instanceof Error ? error.message : String(error), true);
        } finally {
          button.disabled = false;
        }
      }

      function renderReport(report) {
        const key = report.virtualKey;
        text("spend", formatUsd(report.totals.spend));
        text("tokens", compact(report.totals.totalTokens));
        text("requests", compact(report.totals.requests));
        text("budget", key.maxBudget > 0 ? formatUsd(key.maxBudget) : "Not set");
        text("budgetUsed", formatUsd(key.spend));
        text("budgetRemaining", key.remainingBudget === null ? "—" : formatUsd(key.remainingBudget));
        text("chartTitle", report.range.label + " usage trend");
        renderTrend(report);
        renderRows(report);
        renderBudget(key);
        text("freshness", "Source: LiteLLM API · Range: " + report.range.startDate + " to " + report.range.endDate + " · Loaded: " + new Date(report.generatedAt).toLocaleString());
      }

      function renderTrend(report) {
        const target = document.getElementById("bars");
        const rows = Array.isArray(report.trend) ? report.trend : [];
        if (!rows.length) {
          target.className = "empty";
          target.textContent = "No usage was returned for this virtual key and period.";
          return;
        }
        const metric = report.totals.spend > 0 ? "spend" : report.totals.totalTokens > 0 ? "totalTokens" : "requests";
        const max = Math.max(...rows.map((row) => row[metric]), 1);
        target.className = "bars";
        target.innerHTML = rows.map((row) => {
          const value = row[metric];
          const label = metric === "spend" ? formatUsd(value) : compact(value);
          return '<div class="bar"><span class="bar-name">' + escapeHtml(row.date) + '</span><span class="track"><i style="width:' + Math.max(2, Math.round(value / max * 100)) + '%"></i></span><span class="bar-value">' + escapeHtml(label) + '</span></div>';
        }).join("");
      }

      function renderRows(report) {
        const target = document.getElementById("rows");
        const models = Array.isArray(report.topModels) ? report.topModels : [];
        if (!models.length) {
          target.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9fb0c8">No rows returned.</td></tr>';
          return;
        }
        const denominator = report.totals.spend || 1;
        target.innerHTML = models.map((row) => {
          return "<tr><td>" + escapeHtml(row.name) + "</td><td>" + escapeHtml(formatUsd(row.spend)) + "</td><td>" + escapeHtml(compact(row.totalTokens)) + "</td><td>" + escapeHtml(compact(row.requests)) + "</td><td>" + escapeHtml((row.spend / denominator * 100).toFixed(1) + "%") + "</td></tr>";
        }).join("");
      }

      function renderBudget(key) {
        const utilization = key.budgetUtilizationPercent;
        document.getElementById("budgetBar").style.width = Math.min(100, Math.max(0, utilization || 0)) + "%";
        document.getElementById("keyMeta").innerHTML = [
          "<span><strong>Key:</strong> " + escapeHtml(key.label) + "</span>",
          "<span><strong>Owner:</strong> " + escapeHtml(key.owner) + "</span>",
          key.teamId ? "<span><strong>Team:</strong> " + escapeHtml(key.teamId) + "</span>" : "",
          "<span><strong>Utilization:</strong> " + (utilization === null ? "Budget not configured" : escapeHtml(utilization.toFixed(1) + "%")) + "</span>",
          key.budgetDuration ? "<span><strong>Budget period:</strong> " + escapeHtml(key.budgetDuration) + "</span>" : "",
          key.budgetResetAt ? "<span><strong>Next reset:</strong> " + escapeHtml(key.budgetResetAt) + "</span>" : "",
        ].filter(Boolean).join("");
      }

      function publishContext(report) {
        window.parent?.postMessage({
          type: "caipe.agenticApp.context.v1",
          version: "1.0",
          appId: "litellm",
          context: {
            route: appPath,
            title: "LiteLLM operations dashboard",
            agentId: configuredAgentId,
            mcpServerId: "litellm",
            domainAnswersRequireMcp: true,
            summary: report.virtualKey.label + " used " + formatUsd(report.totals.spend) + ", " + compact(report.totals.totalTokens) + " tokens, and " + compact(report.totals.requests) + " requests in " + report.range.label + ".",
            selection: JSON.stringify({ ...report, topModels: report.topModels.slice(0, 10), trend: report.trend.slice(-24) }).slice(0, 8000),
            resourceRefs: [
              { kind: "agent", id: configuredAgentId },
              { kind: "mcp-server", id: "litellm-mcp" },
              { kind: "schema", id: "litellm.dashboard.v1" },
            ],
            suggestedPrompts: [
              "Explain this virtual key's spend and token trend.",
              "Is this virtual key on track to exceed its budget?",
              "Which models drive this virtual key's usage?",
            ],
          },
        }, window.location.origin);
      }

      function openAssistant() {
        if (state.report) publishContext(state.report);
        window.parent?.postMessage({
          type: "caipe.agenticApp.assistant.open.v1",
          version: "1.0",
          appId: "litellm",
        }, window.location.origin);
      }

      function setStatus(title, detail) { document.getElementById("status").innerHTML = "<strong>" + escapeHtml(title) + "</strong> · " + escapeHtml(detail); }
      function setNotice(message, error) { const node = document.getElementById("notice"); node.className = error ? "notice error" : "notice"; node.textContent = message; }
      function text(id, value) { document.getElementById(id).textContent = value; }
      function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
      function formatUsd(value) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value < 10 ? 3 : 2 }).format(number(value)); }
      function compact(value) { return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(number(value)); }
      function appRoute(path) { return (basePath || "") + path; }
      function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]); }

      loadVirtualKeys();
    </script>
  </body>
</html>`;
}

function normalizeBasePath(value) {
  const normalized = String(value || "/apps/litellm").trim();
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return withLeadingSlash.replace(/\/+$/, "") || "/apps/litellm";
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}
