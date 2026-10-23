#!/usr/bin/env node

import { createServer } from "node:http";

import { handleAppMcpRequest } from "../../_lib/app-mcp-server.mjs";
import { createRequiredAgenticAppJwtVerifier } from "../../_lib/jwt-verify.mjs";
import { authorizeAgenticAppRuntimeRequest } from "../../_lib/runtime-authorization.mjs";
import {
  resolveAgenticAppRuntimeBasePath,
  resolveAgenticAppSurface,
} from "../../_lib/runtime-base-path.mjs";
import { renderStaticDashboardExample } from "../../_lib/static-dashboard-examples.mjs";
import { registerLiteLlmMcpTools } from "./mcp.mjs";
import { loadLiteLlmModelCatalog, sanitizeLiteLlmModelInfo } from "./model-info.mjs";
import { renderLiteLlmDashboard } from "./dashboard.mjs";
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
      const catalog = await getLiteLlmVirtualKeys({ refresh: url.searchParams.get("refresh") === "true" });
      const result = selectLiteLlmVirtualKeys(catalog.keys, {
        search: url.searchParams.get("search") ?? "",
        sort: url.searchParams.get("sort") ?? "spend",
        page: url.searchParams.get("page") ?? 1,
        size: url.searchParams.get("size") ?? 10,
      });
      const requestedKey = url.searchParams.get("key");
      const requestedUser = url.searchParams.get("user")?.trim().toLowerCase();
      let selectedKey;
      if (requestedKey) {
        selectedKey = catalog.keys.find((key) => key.public.id === requestedKey)?.public ?? null;
      } else if (requestedUser) {
        const username = requestedUser.split("@")[0];
        const exactMatches = catalog.keys.filter(({ public: key }) => key.label.toLowerCase() === requestedUser || key.owner.toLowerCase() === requestedUser || (requestedUser.includes("@") && key.label.toLowerCase() === username));
        selectedKey = exactMatches.length ? selectLiteLlmVirtualKeys(exactMatches, { sort: result.sort, size: 1 }).keys[0] : result.pagination.totalCount === 1 ? result.keys[0] : null;
      }
      sendJson(response, 200, { success: true, ...result, ...(selectedKey !== undefined ? { selectedKey } : {}), updatedAt: catalog.updatedAt });
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
      const data = await loadLiteLlmModelCatalog(fetchLiteLlmJson, key);
      sendJson(response, 200, { success: true, data });
    } catch {
      sendJson(response, 502, { success: false, error: "Could not load the configured LiteLLM model catalog" });
    }
    return;
  }

  if (url.pathname === "/api/usage" && request.method === "GET") {
    try {
      const report = await getLiteLlmVirtualKeyUsage({
        keyId: url.searchParams.get("key"),
        period: url.searchParams.get("period"),
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

async function getLiteLlmDailyActivity({ startDate, endDate }) {
  return fetchLiteLlmJson("/user/daily/activity/aggregated", { start_date: startDate, end_date: endDate });
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

async function getLiteLlmVirtualKeyUsage({ keyId, period, refresh }) {
  const catalog = await getLiteLlmVirtualKeys({ refresh });
  const key = catalog.keys.find((candidate) => candidate.public.id === keyId);
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
  return { ...buildLiteLlmUsageDashboard({ key, range, responses }), keysUpdatedAt: catalog.updatedAt };
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
