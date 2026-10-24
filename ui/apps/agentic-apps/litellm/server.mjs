#!/usr/bin/env node

import { createServer } from "node:http";
import { createHash } from "node:crypto";

import { handleAppMcpRequest } from "../../_lib/app-mcp-server.mjs";
import { createRequiredAgenticAppJwtVerifier } from "../../_lib/jwt-verify.mjs";
import { authorizeAgenticAppRuntimeRequest } from "../../_lib/runtime-authorization.mjs";
import {
  resolveAgenticAppRuntimeBasePath,
  resolveAgenticAppSurface,
} from "../../_lib/runtime-base-path.mjs";
import { renderStaticDashboardExample } from "../../_lib/static-dashboard-examples.mjs";
import { buildLiteLlmKeyPeriodSpend } from "./key-period-spend.mjs";
import { registerLiteLlmMcpTools } from "./mcp.mjs";
import { loadLiteLlmKeyDetails, loadLiteLlmModelCatalog, sanitizeLiteLlmModelInfo } from "./model-info.mjs";
import { renderLiteLlmDashboard } from "./dashboard.mjs";
import { buildLiteLlmAnomalyReport, buildLiteLlmAnomalyContributors, resolveLiteLlmAnomalyRange } from "./anomalies.mjs";
import {
  buildLiteLlmVirtualKeyListQuery,
  buildLiteLlmUsageDashboard,
  loadLiteLlmVirtualKeys,
  selectLiteLlmVirtualKeys,
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

let keyCatalog;
let keyCatalogRequest;
const keyDetailsCache = new Map();
const overviewCache = new Map();
const OVERVIEW_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const anomalyCache = new Map();
const anomalyContributorCache = new Map();

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
          getCostAnomalies: getLiteLlmAnomalies,
          getAnomalyContributors: getLiteLlmAnomalyContributors,
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
      const catalog = await getLiteLlmVirtualKeys({ refresh: url.searchParams.get("refresh") === "true" });
      const email = request.caipeIdentity?.email?.trim().toLowerCase() || null;
      const myKeys = email ? catalog.keys.filter((key) => key.public.owner.toLowerCase() === email || key.ownerId?.toLowerCase() === email) : [];
      const scope = url.searchParams.get("scope") === "mine" ? "mine" : "all";
      const scopedKeys = scope === "mine" ? myKeys : catalog.keys;
      const monthly = url.searchParams.get("period") === "month";
      const snapshot = monthly ? await getLiteLlmGatewaySnapshot({ period: "month", refresh: url.searchParams.get("refresh") === "true" }) : null;
      const periodSpend = snapshot?.keySpend;
      const hasKnownKeys = periodSpend?.complete && (periodSpend.totalSpend === 0 || catalog.keys.some((key) => periodSpend.spendByKey.has(key.upstreamKey) || periodSpend.spendByKey.has(createHash("sha256").update(key.upstreamKey).digest("hex"))));
      const rankedKeys = monthly ? scopedKeys.map((key) => {
        const amount = periodSpend?.complete ? periodSpend.spendByKey.get(key.upstreamKey) ?? periodSpend.spendByKey.get(createHash("sha256").update(key.upstreamKey).digest("hex")) : undefined;
        return { ...key, public: { ...key.public, periodSpend: amount ?? (hasKnownKeys ? 0 : null) } };
      }) : scopedKeys;
      const result = selectLiteLlmVirtualKeys(rankedKeys, {
        search: url.searchParams.get("search") ?? "",
        sort: url.searchParams.get("sort") ?? "spend",
        page: url.searchParams.get("page") ?? 1,
        size: url.searchParams.get("size") ?? 10,
        spendField: monthly ? "periodSpend" : "spend",
      });
      const requestedKey = url.searchParams.get("key");
      const requestedUser = url.searchParams.get("user")?.trim().toLowerCase();
      let selectedKey;
      if (requestedKey) {
        selectedKey = scopedKeys.find((key) => key.public.id === requestedKey)?.public ?? null;
      } else if (requestedUser) {
        const username = requestedUser.split("@")[0];
        const exactMatches = scopedKeys.filter(({ public: key }) => key.label.toLowerCase() === requestedUser || key.owner.toLowerCase() === requestedUser || (requestedUser.includes("@") && key.label.toLowerCase() === username));
        selectedKey = exactMatches.length === 1 ? exactMatches[0].public : result.pagination.totalCount === 1 ? result.keys[0] : null;
      } else if (scope === "mine") {
        selectedKey = myKeys.length === 1 ? myKeys[0].public : null;
      }
      sendJson(response, 200, { success: true, ...result, scope, viewer: { email, name: request.caipeIdentity?.name ?? null, linkedKeys: myKeys.length, keyIds: myKeys.map((key) => key.public.id) }, ...(selectedKey !== undefined ? { selectedKey } : {}), updatedAt: monthly ? snapshot.overview.cache.updatedAt : catalog.updatedAt, ...(monthly ? { range: snapshot.overview.range, cache: snapshot.overview.cache, warnings: [...periodSpend.warnings, ...(!hasKnownKeys && periodSpend.totalSpend !== 0 ? ["Activity could not be matched to the current key catalog; monthly spend remains unavailable."] : [])] } : {}) });
    } catch (error) {
      sendJson(response, 502, {
        success: false,
        error: error instanceof Error ? error.message : "Could not load LiteLLM virtual keys",
      });
    }
    return;
  }

  if (url.pathname === "/api/models" && request.method === "GET") {
    try {
      const keyId = url.searchParams.get("key");
      const catalog = keyId ? await getLiteLlmVirtualKeys() : null;
      const key = keyId ? catalog.keys.find((candidate) => candidate.public.id === keyId) : null;
      if (keyId && !key) { sendJson(response, 404, { success: false, error: "Virtual key not found" }); return; }
      const data = await loadLiteLlmModelCatalog(fetchLiteLlmJson, key, { keyDetails: key ? getKeyDetails(key) : undefined });
      sendJson(response, 200, { success: true, data });
    } catch {
      sendJson(response, 502, { success: false, error: "Could not load the configured LiteLLM model catalog" });
    }
    return;
  }

  if (url.pathname === "/api/anomalies" && request.method === "GET") {
    try {
      const data = await getLiteLlmAnomalies({
        days: url.searchParams.get("days"),
        minImpactUsd: url.searchParams.get("minImpact"),
        minIncreasePercent: url.searchParams.get("minIncrease"),
        refresh: url.searchParams.get("refresh") === "true",
      });
      sendJson(response, 200, { success: true, data });
    } catch (error) {
      console.error("LiteLLM anomaly analysis failed:", error instanceof Error ? error.message : "Unknown error");
      sendJson(response, 502, { success: false, error: "Could not analyze gateway usage. Check reporting access and activity completeness, then retry." });
    }
    return;
  }

  if (url.pathname === "/api/anomaly-contributors" && request.method === "GET") {
    try {
      const data = await getLiteLlmAnomalyContributors({ model: url.searchParams.get("model"), snapshotId: url.searchParams.get("snapshotId"), days: url.searchParams.get("days"), endDate: url.searchParams.get("endDate"), minImpactUsd: url.searchParams.get("minImpact"), minIncreasePercent: url.searchParams.get("minIncrease") });
      sendJson(response, 200, { success: true, data });
    } catch (error) {
      console.error("LiteLLM anomaly attribution failed:", error instanceof Error ? error.message : "Unknown error");
      sendJson(response, 502, { success: false, error: "Could not attribute this model spike. Refresh analysis and retry; no user or key was inferred." });
    }
    return;
  }

  if (url.pathname === "/api/overview" && request.method === "GET") {
    try {
      const data = await getLiteLlmOverview({ period: url.searchParams.get("period"), refresh: url.searchParams.get("refresh") === "true" });
      sendJson(response, 200, { success: true, data });
    } catch (error) {
      console.error("LiteLLM gateway overview failed:", error instanceof Error ? error.message : "Unknown error");
      sendJson(response, 502, { success: false, error: "Could not load gateway-wide usage for this period. Check the gateway reporting permissions and retained history." });
    }
    return;
  }

  if (url.pathname === "/api/usage" && request.method === "GET") {
    try {
      const report = await getLiteLlmVirtualKeyUsage({
        keyId: url.searchParams.get("key"),
        period: url.searchParams.get("period"),
        startDate: url.searchParams.get("startDate"),
        endDate: url.searchParams.get("endDate"),
        refresh: url.searchParams.get("refresh") === "true",
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
      renderLiteLlmDashboard({
        compact: surface === "hosted",
        basePath,
        appPath: configuredBasePath,
        agentId,
      }),
    );
    return;
  }

  sendJson(response, 404, { error: "not_found" });
});

server.listen(port, () => {
  console.log(`LiteLLM Usage Dashboard listening on http://localhost:${server.address().port}`);
  console.log(`Configure CAIPE with AGENTIC_APP_LITELLM_ORIGIN=http://localhost:${port}`);
});

async function getLiteLlmDailyActivity({ startDate, endDate, model }) {
  return fetchLiteLlmJson("/user/daily/activity/aggregated", { start_date: startDate, end_date: endDate, model });
}

async function getLiteLlmModelInfo() {
  return sanitizeLiteLlmModelInfo(await fetchLiteLlmJson("/model/info"));
}

// Coalesce catalog reads and reuse a complete snapshot for interactive search.
async function getLiteLlmVirtualKeys({ refresh = false } = {}) {
  if (!refresh && keyCatalog && Date.now() - keyCatalog.loadedAt < 30_000) return keyCatalog;
  if (keyCatalogRequest) return keyCatalogRequest;
  keyCatalogRequest = loadLiteLlmVirtualKeys((page) => fetchLiteLlmJson(
    "/key/list", buildLiteLlmVirtualKeyListQuery(page),
  )).then((keys) => {
    keyCatalog = { keys, loadedAt: Date.now(), updatedAt: new Date().toISOString() };
    return keyCatalog;
  });
  try {
    return await keyCatalogRequest;
  } finally {
    keyCatalogRequest = undefined;
  }
}

async function getLiteLlmVirtualKeyUsage({ keyId, period, startDate, endDate, refresh }) {
  const catalog = await getLiteLlmVirtualKeys({ refresh });
  const key = catalog.keys.find((candidate) => candidate.public.id === keyId);
  if (!key) throw new Error("Virtual key not found");
  const range = resolveLiteLlmUsageRange(period, new Date(), { startDate, endDate });
  const responses = [];
  for (const segment of range.segments) {
    responses.push(await fetchLiteLlmJson("/user/daily/activity/aggregated", {
      start_date: segment.startDate,
      end_date: segment.endDate,
      api_key: key.upstreamKey,
    }));
  }
  const details = await getKeyDetails(key, { refresh });
  const report = buildLiteLlmUsageDashboard({ key, range, responses });
  return { ...report, budgets: details.budgets, warnings: [...report.warnings, ...details.warnings], keysUpdatedAt: catalog.updatedAt };
}

async function getLiteLlmOverview(options) {
  return (await getLiteLlmGatewaySnapshot(options)).overview;
}

// Overview and the monthly key ranking share a compact, coalesced source snapshot.
// Keep only derived reports and private key sums, not the bulky upstream records.
async function getLiteLlmGatewaySnapshot({ period, refresh = false }) {
  const range = resolveLiteLlmUsageRange(period);
  const cacheKey = range.period + ":" + range.startDate + ":" + range.endDate;
  const cached = overviewCache.get(cacheKey);
  if (cached?.pending || (!refresh && cached && Date.now() < cached.expiresAt)) return cached.promise;
  if (!cached && overviewCache.size >= 10) overviewCache.delete(overviewCache.keys().next().value);
  const entry = { pending: true, expiresAt: 0 };
  entry.promise = (async () => {
    const responses = [];
    for (const segment of range.segments) {
      const data = await getLiteLlmDailyActivity(segment);
      if (!Array.isArray(data?.results) || data.metadata?.has_more || Number(data.metadata?.total_pages) > 1) throw new Error("Incomplete gateway usage response");
      responses.push(data);
    }
    const report = buildLiteLlmUsageDashboard({ range, responses });
    const keySpend = range.period === "month" ? buildLiteLlmKeyPeriodSpend({ range, responses }) : null;
    const updatedAt = new Date().toISOString();
    entry.expiresAt = Date.now() + OVERVIEW_CACHE_TTL_MS;
    entry.pending = false;
    const cache = { updatedAt, expiresAt: new Date(entry.expiresAt).toISOString(), ttlSeconds: OVERVIEW_CACHE_TTL_MS / 1000 };
    return { overview: { ...report, cache }, keySpend };
  })().catch((error) => { if (overviewCache.get(cacheKey) === entry) overviewCache.delete(cacheKey); throw error; });
  overviewCache.set(cacheKey, entry);
  return entry.promise;
}

async function getLiteLlmAnomalies({ days, minImpactUsd, minIncreasePercent, endDate, refresh = false }) {
  let now = new Date();
  if (endDate !== undefined) {
    const timestamp = Date.parse(endDate + "T00:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== endDate || endDate > resolveLiteLlmAnomalyRange(1).endDate) throw new Error("Analysis end date must be a completed UTC date");
    now = new Date(timestamp + 86_400_000);
  }
  const range = resolveLiteLlmAnomalyRange(days, now);
  if (refresh) anomalyContributorCache.clear();
  const cacheKey = range.windowDays + ":" + range.endDate;
  let entry = anomalyCache.get(cacheKey);
  if (!entry?.pending && (refresh || !entry || Date.now() - entry.loadedAt >= 30_000)) {
    if (anomalyCache.size >= 10) anomalyCache.delete(anomalyCache.keys().next().value);
    entry = { loadedAt: Date.now(), pending: true };
    entry.promise = getLiteLlmDailyActivity({ startDate: range.baselineStartDate, endDate: range.endDate })
      .then((value) => { entry.pending = false; return value; })
      .catch((error) => { anomalyCache.delete(cacheKey); throw error; });
    anomalyCache.set(cacheKey, entry);
  }
  const response = await entry.promise;
  const report = buildLiteLlmAnomalyReport({ response, range, minImpactUsd, minIncreasePercent });
  const { generatedAt, ...evidence } = report;
  const snapshotId = createHash("sha256").update(JSON.stringify(evidence)).digest("hex").slice(0, 32);
  return { ...report, snapshotId, sourceUpdatedAt: new Date(entry.loadedAt).toISOString() };
}

async function getLiteLlmAnomalyContributors({ model, snapshotId, ...options }) {
  if (typeof model !== "string" || !model || model.length > 500 || typeof snapshotId !== "string" || !/^[a-f0-9]{32}$/.test(snapshotId)) throw new Error("A model and anomaly snapshot are required");
  const report = await getLiteLlmAnomalies(options);
  const finding = report.findings.find((row) => row.model === model);
  if (report.snapshotId !== snapshotId || report.status !== "ready" || !finding) return { status: "unavailable", reason: "This model comparison changed or is unavailable. Refresh analysis before attributing spend.", model, contributors: [] };
  const cacheKey = snapshotId + ":" + model;
  const cached = anomalyContributorCache.get(cacheKey);
  if (cached?.pending || (cached && Date.now() - cached.loadedAt < 30_000)) return cached.promise;
  if (anomalyContributorCache.size >= 40) anomalyContributorCache.delete(anomalyContributorCache.keys().next().value);
  const entry = { pending: true, loadedAt: Date.now() };
  const sourceEntry = anomalyCache.get(report.range.windowDays + ":" + report.range.endDate);
  entry.promise = (async () => {
    const [response, globalResponse, catalog] = await Promise.all([
      getLiteLlmDailyActivity({ startDate: report.range.baselineStartDate, endDate: report.range.endDate, model }),
      sourceEntry.promise,
      getLiteLlmVirtualKeys(),
    ]);
    const data = buildLiteLlmAnomalyContributors({ response, globalResponse, finding, range: report.range, keys: catalog.keys });
    entry.pending = false;
    entry.loadedAt = Date.now();
    return { ...data, snapshotId, sourceUpdatedAt: new Date(entry.loadedAt).toISOString() };
  })().catch((error) => { if (anomalyContributorCache.get(cacheKey) === entry) anomalyContributorCache.delete(cacheKey); throw error; });
  anomalyContributorCache.set(cacheKey, entry);
  return entry.promise;
}

async function getKeyDetails(key, { refresh = false } = {}) {
  const cached = keyDetailsCache.get(key.public.id);
  if (cached?.pending || (!refresh && cached && Date.now() - cached.loadedAt < 30_000)) return cached.promise;
  if (keyDetailsCache.size >= 500) keyDetailsCache.delete(keyDetailsCache.keys().next().value);
  const entry = { loadedAt: Date.now(), pending: true };
  entry.promise = loadLiteLlmKeyDetails(fetchLiteLlmJson, key).then((value) => { entry.pending = false; return value; }).catch((error) => { keyDetailsCache.delete(key.public.id); throw error; });
  keyDetailsCache.set(key.public.id, entry);
  return entry.promise;
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
