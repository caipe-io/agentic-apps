#!/usr/bin/env node

import { createServer } from "node:http";
import { readInfrastructureSourceConfiguration } from "../../_lib/infrastructure-source-config.mjs";
import { createFinopsInfrastructureSources } from "./sdk-infrastructure-sources.mjs";

import { handleAppMcpRequest } from "../../_lib/app-mcp-server.mjs";
import { createRequiredAgenticAppJwtVerifier } from "../../_lib/jwt-verify.mjs";
import { authorizeAgenticAppRuntimeRequest } from "../../_lib/runtime-authorization.mjs";
import {
  resolveAgenticAppRuntimeBasePath,
  resolveAgenticAppSurface,
} from "../../_lib/runtime-base-path.mjs";
import { renderStaticDashboardExample } from "../../_lib/static-dashboard-examples.mjs";
import {
  buildAwsCostExplorerPrompt,
  parseAwsAccountList,
  resolveAwsProfile,
  selectDefaultAwsProfile,
} from "./aws-account-config.mjs";
import { registerFinOpsMcpTools } from "./mcp.mjs";
import { finopsCostConfiguration } from "./costs.mjs";
import { createFinopsCostService } from "./sdk-costs.mjs";
import { renderFinopsDashboard } from "./dashboard.mjs";

const port = Number(process.env.FINOPS_APP_PORT ?? "3010");
const configuredBasePath = normalizeBasePath(process.env.FINOPS_APP_BASE_PATH ?? "/apps/finops");
const defaultAwsAgentId = process.env.FINOPS_AGENT_ID ?? process.env.FINOPS_AWS_AGENT_ID ?? "agent-finops";
const defaultDataSource = "aws-cost-explorer";
const defaultAgentId = defaultAwsAgentId;
const defaultLookbackDays = Number(process.env.FINOPS_LOOKBACK_DAYS ?? "30");
const defaultDashboardKind = process.env.FINOPS_DASHBOARD_KIND ?? "cost-overview";
const configuredAwsAccounts = parseAwsAccountList(
  process.env.FINOPS_AWS_ACCOUNT_LIST ?? process.env.AWS_ACCOUNT_LIST ?? "",
);
const defaultAwsProfile = selectDefaultAwsProfile(
  configuredAwsAccounts,
  process.env.FINOPS_AWS_DEFAULT_PROFILE ?? "",
);
const litellmApiUrl = (process.env.LITELLM_API_URL ?? "").replace(/\/+$/, "");
const litellmApiToken = process.env.LITELLM_API_KEY ?? process.env.LITELLM_TOKEN ?? process.env.LITELLM_API_TOKEN ?? "";
const litellmApiTimeoutMs = Math.max(5_000, Number(process.env.LITELLM_API_TIMEOUT ?? "30") * 1000);

const verifier = createRequiredAgenticAppJwtVerifier({
  appId: "finops",
  disabled: process.env.AGENTIC_APP_FINOPS_JWT_DISABLED === "true",
});

const costConfiguration = finopsCostConfiguration();
const costs = createFinopsCostService(costConfiguration);
const infrastructureSources = createFinopsInfrastructureSources(costConfiguration, readInfrastructureSourceConfiguration());
let stopBackgroundRefresh, stopInfrastructureRefresh;

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const basePath = resolveAgenticAppRuntimeBasePath(request.headers, configuredBasePath, "finops");
  const surface = resolveAgenticAppSurface(request.headers);

  if (["/health/live", "/health/ready", "/healthz"].includes(url.pathname)) {
    sendJson(response, 200, {
      ok: true,
      app: "finops",
      runtime: "separate-process",
      dataSource: "aws-cost-explorer-sdk",
      assistant: "context-aware",
      mcp: { endpoint: "/mcp", authentication: "forwarded-bearer" },
    });
    return;
  }

  if (url.pathname === "/mcp") {
    await handleAppMcpRequest(request, response, {
      name: "finops-app",
      authenticationDisabled: process.env.AGENTIC_APP_FINOPS_MCP_AUTH_DISABLED === "true",
      registerTools(mcpServer) {
        registerFinOpsMcpTools(mcpServer, {
          getCapabilities: buildFinOpsAgentPlan,
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
    appId: "finops",
    method: request.method,
    readScope: "finops:read",
    invokeScope: "finops:agent:invoke",
    allowDevelopmentBypass: verifier === null,
  });
  if (!authorization.ok) {
    sendJson(response, authorization.status, {
      error: authorization.error,
      requiredScope: authorization.requiredScope,
    });
    return;
  }

  if (url.pathname === "/api/infrastructure-sources") {
    if (!["GET", "HEAD"].includes(request.method)) { sendJson(response, 405, { success: false, error: "method_not_allowed" }); return; }
    try {
      const profile = url.searchParams.get("profile") || "*";
      const selected = profile === "*" ? costConfiguration.accounts : costConfiguration.accounts.filter((account) => (account.profile || "@default") === profile);
      if (!selected.length) throw new Error("Choose a configured AWS account.");
      const data = await infrastructureSources.view({ profiles: selected.map((account) => account.profile), service: url.searchParams.get("service") || "", search: url.searchParams.get("search") || "", page: Number(url.searchParams.get("page") || 1), force: url.searchParams.get("refresh") === "1" });
      sendJson(response, 200, { success: true, data });
    } catch (error) { sendJson(response, 400, { success: false, error: error instanceof Error ? error.message : "Infrastructure sources unavailable." }); }
    return;
  }

  if (["/api/costs", "/api/cache-status"].includes(url.pathname)) {
    if (!["GET", "HEAD"].includes(request.method)) { sendJson(response, 405, { success: false, error: "method_not_allowed" }); return; }
    try {
      const data = url.pathname === "/api/cache-status" ? costs.cacheStatus() : await costs.view({ profile: url.searchParams.get("profile") || "*", period: url.searchParams.get("period") || "month", refresh: url.searchParams.get("refresh") === "1" });
      sendJson(response, 200, { success: true, data });
    } catch (error) {
      console.error("[finops] Cost snapshot request failed", { error: error instanceof Error ? error.name : "UnknownError" });
      sendJson(response, 400, { success: false, error: error instanceof Error ? error.message : "Cost data unavailable." });
    }
    return;
  }

  if (url.pathname === "/api/context" && request.method === "GET") {
    sendJson(response, 200, {
      version: "1.0",
      appId: "finops",
      route: "/apps/finops",
      title: "FinOps Command Center",
      agentId: defaultAgentId,
      mcpServerId: "finops_app",
      domainAnswersRequireMcp: true,
      suggestedPrompts: [
        "Explain the biggest cost drivers in this FinOps context.",
        "Which anomaly should a platform engineer investigate first?",
        "Create a safe optimization action plan.",
      ],
    });
    return;
  }

  if (url.pathname === "/api/summary") {
    sendJson(response, 200, buildFinOpsAgentPlan());
    return;
  }

  if (url.pathname === "/api/finops") {
    sendJson(response, 200, buildFinOpsAgentPlan());
    return;
  }

  if (url.pathname === "/api/aws-analysis-request") {
    if (request.method !== "POST") {
      sendJson(response, 405, { success: false, error: "method_not_allowed" });
      return;
    }

    try {
      const body = await readJsonBody(request);
      const analysisRequest = buildAwsAnalysisRequest(body);
      sendJson(response, 200, { success: true, data: analysisRequest });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid AWS analysis request.";
      sendJson(response, 400, { success: false, error: message, code: "invalid_aws_analysis_request" });
    }
    return;
  }

  if (url.pathname === "/example") {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(renderStaticDashboardExample("finops", authorization.summary));
    return;
  }

  if (url.pathname === "/" || url.pathname === "/dashboard") {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(renderFinopsDashboard({ compact: surface === "hosted", basePath, appPath: configuredBasePath, configuration: costConfiguration, agentId: defaultAgentId }));
    return;
  }

  sendJson(response, 404, { error: "not_found" });
});

server.listen(port, () => {
  if (costConfiguration.backgroundRefreshEnabled) stopInfrastructureRefresh = infrastructureSources.startBackgroundRefresh();
  if (costConfiguration.backgroundRefreshEnabled) stopBackgroundRefresh = costs.startBackgroundRefresh({ onRefresh: (status) => console.log("[finops] Background cost refresh", { completedAccounts: status.completedAccounts, totalAccounts: status.totalAccounts, failures: status.failures, nextRefreshAt: status.nextRefreshAt }) });
  console.log(`FinOps Command Center listening on http://localhost:${server.address().port}`);
  console.log(`Configure CAIPE with AGENTIC_APP_FINOPS_ORIGIN=http://localhost:${server.address().port}`);
  console.log(`Configure FINOPS_AGENT_ID=${defaultAgentId} if your AWS agent uses a different id`);
});

server.on("close", () => { stopBackgroundRefresh?.(); stopInfrastructureRefresh?.(); });

function buildFinOpsAgentPlan() {
  return {
    status: "ready_for_agent",
    source: "finops-data-via-caipe-dynamic-agent",
    agentId: defaultAgentId,
    dataSource: defaultDataSource,
    dataSources: {
      "aws-cost-explorer": {
        label: "AWS Cost Explorer",
        agentId: defaultAwsAgentId,
        dashboardKinds: ["cost-overview", "service-breakdown", "anomaly-review", "savings-plan"],
        accounts: configuredAwsAccounts.map(({ profile }) => ({ profile })),
        profileRequired: configuredAwsAccounts.length > 0,
        defaultProfile: defaultAwsProfile,
      },
    },
    lookbackDays: defaultLookbackDays,
    dashboardKind: defaultDashboardKind,
    endpoint: "/api/v1/chat/invoke",
    prompt: configuredAwsAccounts.length && !defaultAwsProfile
      ? null
      : buildDashboardPrompt(defaultDataSource, defaultLookbackDays, defaultDashboardKind),
    responseFormat: buildFinOpsDashboardResponseFormat(),
    expectedJsonShape: {
      dataSource: "aws-cost-explorer",
      currency: "USD",
      totalCost: 1234.56,
      forecastCost: 1567.89,
      totalTokens: 123456789,
      totalRequests: 12345,
      services: [{ name: "Amazon EC2", amount: 500.0 }],
      trend: [{ date: "2026-05-01", amount: 123.45 }],
      rawCost: [{ date: "2026-05-01", service: "Amazon EC2", account: "example-account", amount: 123.45, unit: "USD" }],
      anomalies: [{ service: "Amazon EC2", impact: 120.0, explanation: "Short explanation" }],
      recommendations: ["Actionable recommendation"],
    },
  };
}

function buildDashboardPrompt(dataSource, days, dashboardKind = "cost-overview") {
  const range = dateRangeForLookback(days);
  return buildAwsCostExplorerPrompt({
    dashboardKind,
    period: {
      label: `Last ${days} days`,
      start: range.startDate,
      end: range.endDate,
    },
    profile: defaultAwsProfile,
  });
}

function buildAwsAnalysisRequest(body = {}) {
  const dashboardKind = String(body.dashboardKind || "cost-overview");
  const allowedDashboardKinds = ["cost-overview", "service-breakdown", "anomaly-review", "savings-plan"];
  if (!allowedDashboardKinds.includes(dashboardKind)) {
    throw new Error("Choose a supported AWS Cost Explorer dashboard.");
  }

  const start = normalizeIsoDate(body.startDate);
  const end = normalizeIsoDate(body.endDate);
  if (!start || !end || parseIsoDate(start) > parseIsoDate(end)) {
    throw new Error("Choose a valid FinOps reporting period.");
  }

  const profile = resolveAwsProfile(configuredAwsAccounts, body.profile, defaultAwsProfile);
  const period = {
    label: String(body.periodLabel || `${start} to ${end}`).slice(0, 80),
    start,
    end,
  };
  return {
    profile,
    prompt: buildAwsCostExplorerPrompt({ dashboardKind, period, profile }),
    clientContext: {
      requestedDataSource: "aws-cost-explorer",
      response_format: buildFinOpsDashboardResponseFormat(),
      dashboardKind,
      awsProfile: profile || null,
      period,
    },
  };
}

function buildLiteLlmPrompt(days, dashboardKind = "llm-usage-by-user") {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(1, Number(days) || defaultLookbackDays) + 1);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const toolByKind = {
    "llm-usage-by-user": "get_llm_usage_and_spend_by_user_report",
    "llm-spend-by-model": "get_llm_spend_by_model_report",
    "llm-token-usage": "get_llm_token_usage_report",
    "llm-top-models": "get_llm_top_models_report",
  };
  const toolName = toolByKind[dashboardKind] || "get_llm_usage_and_spend_by_user_report";
  return [
    `Build the ${dashboardKind} FinOps dashboard using LiteLLM usage data from ${startDate} through ${endDate}.`,
    "Do not call request_user_input or ask follow-up questions; this embedded dashboard request already includes the report type, date range, output shape, and target dashboard.",
    `Use the LiteLLM MCP curated report tool ${toolName} with start_date=${startDate}, end_date=${endDate}, limit=20, and report_format=html_csv.`,
    "Do not call raw spend log pagination tools unless the curated report tool fails.",
    "Use submit_structured_response with schema finops.dashboard.v1 before the final explanation.",
    "Set dataSource to litellm.",
    "Map LiteLLM totals.spend to totalCost, totals.total_tokens to totalTokens, and totals.requests to totalRequests.",
    "Set currency to USD and forecastCost to totalCost because LiteLLM reports are historical.",
    "Map the main ranked LiteLLM rows into services where name is the user/model label and amount is spend. If spend is zero, use total_tokens as amount and include total_tokens in rawCost rows.",
    `Map chart_data or report tables into rawCost rows with date=${startDate}, service=user/model label, amount=spend, unit=USD, and optional totalTokens and requests when available.`,
    "Trend may be an empty array if the curated LiteLLM report does not include daily trend points. Do not invent trend values.",
    "Keep the final explanation short and dashboard-focused.",
  ].join(" ");
}

function buildFinOpsDashboardResponseFormat() {
  return {
    type: "json_schema",
    schema_id: "finops.dashboard.v1",
    schema: {
      type: "object",
      required: ["currency", "totalCost", "forecastCost", "services", "trend", "rawCost", "anomalies", "recommendations"],
      properties: {
        dataSource: { type: "string" },
        currency: { type: "string" },
        totalCost: { type: "number" },
        forecastCost: { type: "number" },
        totalTokens: { type: "number" },
        totalRequests: { type: "number" },
        services: { type: "array" },
        trend: { type: "array" },
        rawCost: { type: "array" },
        anomalies: { type: "array" },
        recommendations: { type: "array" },
      },
    },
  };
}

async function buildLiteLlmDashboardPayload(options = {}) {
  if (!litellmApiUrl || !litellmApiToken) {
    throw new Error("LiteLLM dashboard direct mode requires LITELLM_API_URL and LITELLM_API_KEY/LITELLM_TOKEN.");
  }

  const dashboardKind = normalizeLiteLlmDashboardKind(options.dashboardKind);
  const range = liteLlmDateRangeFromOptions(options);
  const rollup = await fetchLiteLlmActivityRollup(range.startDate, range.endDate);
  const analysis = liteLlmRollupToDashboard(rollup, {
    dashboardKind,
    lookbackDays: range.lookbackDays,
    periodLabel: range.label,
    startDate: range.startDate,
    endDate: range.endDate,
  });
  return {
    dashboardKind,
    lookbackDays: range.lookbackDays,
    periodLabel: range.label,
    periodPreset: range.preset,
    startDate: range.startDate,
    endDate: range.endDate,
    analysis,
    content: renderLiteLlmDashboardMarkdown(analysis, dashboardKind, range.startDate, range.endDate),
  };
}

function liteLlmDateRangeFromOptions(options = {}) {
  const startDate = normalizeIsoDate(options.startDate ?? options.start_date);
  const endDate = normalizeIsoDate(options.endDate ?? options.end_date);
  if (startDate && endDate && parseIsoDate(startDate) <= parseIsoDate(endDate)) {
    return {
      startDate,
      endDate,
      lookbackDays: daysBetweenInclusive(startDate, endDate),
      label: String(options.periodLabel || `${startDate} to ${endDate}`),
      preset: String(options.periodPreset || "custom-range"),
    };
  }

  const preset = String(options.periodPreset || options.period || "").toLowerCase();
  const fiscalRanges = {
    fy26q1: { startDate: "2025-08-01", endDate: "2025-10-31", label: "FY26Q1" },
    fy26q2: { startDate: "2025-11-01", endDate: "2026-01-31", label: "FY26Q2" },
    fy26q3: { startDate: "2026-02-01", endDate: "2026-04-30", label: "FY26Q3" },
    fy26q4: { startDate: "2026-05-01", endDate: "2026-07-31", label: "FY26Q4" },
  };
  if (fiscalRanges[preset]) {
    const range = fiscalRanges[preset];
    return {
      ...range,
      lookbackDays: daysBetweenInclusive(range.startDate, range.endDate),
      preset,
    };
  }

  const lookbackDays = clampNumber(options.lookbackDays ?? options.days ?? defaultLookbackDays, 1, 120);
  const range = dateRangeForLookback(lookbackDays);
  return {
    ...range,
    lookbackDays,
    label: `Last ${lookbackDays} days`,
    preset: `last-${lookbackDays}-days`,
  };
}

async function fetchLiteLlmActivityRollup(startDate, endDate) {
  const rollup = newLiteLlmRollup();
  const ranges = monthRanges(startDate, endDate);

  for (const range of ranges) {
    const data = await fetchLiteLlmJson("/user/daily/activity/aggregated", {
      start_date: range.startDate,
      end_date: range.endDate,
    });
    mergeLiteLlmActivityResponse(rollup, data);
    rollup.rangesScanned.push(range);
  }

  return rollup;
}

async function fetchLiteLlmJson(path, params) {
  const url = new URL(`${litellmApiUrl}${path}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${litellmApiToken}`,
    },
    signal: AbortSignal.timeout(litellmApiTimeoutMs),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`LiteLLM API request failed: ${response.status}${text ? ` - ${text.slice(0, 240)}` : ""}`);
  }

  return response.json();
}

function mergeLiteLlmActivityResponse(rollup, response) {
  const results = Array.isArray(response?.results) ? response.results : [];
  rollup.days += results.length;

  for (const day of results) {
    if (!day || typeof day !== "object") continue;

    const dayMetrics = liteLlmMetricsFrom(day.metrics);
    addLiteLlmMetrics(rollup.totals, dayMetrics);
    rollup.trend.push({
      date: String(day.date || day.start_date || day.day || ""),
      amount: dayMetrics.spend,
      totalTokens: dayMetrics.total_tokens,
      requests: dayMetrics.requests,
    });

    const models = day.breakdown?.models && typeof day.breakdown.models === "object" ? day.breakdown.models : {};
    for (const [modelName, modelPayload] of Object.entries(models)) {
      if (!modelPayload || typeof modelPayload !== "object") continue;

      const modelMetrics = liteLlmMetricsFrom(modelPayload.metrics);
      const modelRow = rollup.models.get(modelName) || { model: modelName, ...emptyLiteLlmMetrics() };
      addLiteLlmMetrics(modelRow, modelMetrics);
      rollup.models.set(modelName, modelRow);

      const apiKeys =
        modelPayload.api_key_breakdown && typeof modelPayload.api_key_breakdown === "object"
          ? modelPayload.api_key_breakdown
          : {};
      for (const [apiKeyHash, apiKeyPayload] of Object.entries(apiKeys)) {
        if (!apiKeyPayload || typeof apiKeyPayload !== "object") continue;

        const { userId, displayName } = liteLlmUserIdentity(apiKeyHash, apiKeyPayload);
        const userMetrics = liteLlmMetricsFrom(apiKeyPayload.metrics);
        const userRow =
          rollup.users.get(userId) || {
            user_id: userId,
            display_name: displayName,
            ...emptyLiteLlmMetrics(),
            models: new Map(),
            apiKeyHashes: new Set(),
          };
        userRow.apiKeyHashes.add(String(apiKeyHash));
        addLiteLlmMetrics(userRow, userMetrics);

        const userModel = userRow.models.get(modelName) || { model: modelName, ...emptyLiteLlmMetrics() };
        addLiteLlmMetrics(userModel, userMetrics);
        userRow.models.set(modelName, userModel);
        rollup.users.set(userId, userRow);
      }
    }
  }
}

function liteLlmRollupToDashboard(rollup, { dashboardKind, lookbackDays, periodLabel, startDate, endDate }) {
  const modelRows = finalizeLiteLlmRows([...rollup.models.values()], rankForLiteLlmDashboard(dashboardKind), 20);
  const userRows = finalizeLiteLlmUserRows([...rollup.users.values()], rankForLiteLlmDashboard(dashboardKind), 20);
  const primaryRows =
    dashboardKind === "llm-usage-by-user" ? userRows : modelRows;
  const services = primaryRows.map((row) => {
    const name = row.display_name || row.user_id || row.model || "Unknown LiteLLM row";
    return {
      name,
      amount: toNumber(row.spend),
      totalTokens: toNumber(row.total_tokens),
      requests: toNumber(row.requests),
    };
  });
  const rawCost = primaryRows.map((row) => ({
    date: startDate,
    service: row.display_name || row.user_id || row.model || "Unknown LiteLLM row",
    account: dashboardKind === "llm-usage-by-user" ? `${row.api_key_count || 0} API keys` : "",
    amount: toNumber(row.spend),
    unit: "USD",
    totalTokens: toNumber(row.total_tokens),
    requests: toNumber(row.requests),
  }));
  const trend = rollup.trend
    .filter((item) => item.date)
    .map((item) => ({
      date: item.date,
      amount: toNumber(item.amount),
      totalTokens: toNumber(item.totalTokens),
      requests: toNumber(item.requests),
    }));
  const totals = rollup.totals;

  return {
    status: "structured",
    dataSource: "litellm",
    currency: "USD",
    dashboardKind,
    lookbackDays,
    periodLabel,
    startDate,
    endDate,
    totalCost: toNumber(totals.spend),
    forecastCost: toNumber(totals.spend),
    totalTokens: toNumber(totals.total_tokens),
    totalRequests: toNumber(totals.requests),
    services,
    trend,
    rawCost,
    anomalies: [],
    recommendations: liteLlmDashboardRecommendations(services, totals, dashboardKind),
  };
}

function renderLiteLlmDashboardMarkdown(analysis, dashboardKind, startDate, endDate) {
  const top = analysis.services[0];
  const titleByKind = {
    "llm-usage-by-user": "LiteLLM usage and spend by user",
    "llm-spend-by-model": "LiteLLM spend by model",
    "llm-token-usage": "LiteLLM token usage",
    "llm-top-models": "LiteLLM top models",
  };
  return [
    `## ${titleByKind[dashboardKind] || "LiteLLM dashboard"}`,
    "",
    `Period: ${startDate} to ${endDate}`,
    "",
    `Total spend: ${formatUsd(analysis.totalCost)} across ${formatCompact(analysis.totalRequests)} requests and ${formatCompact(analysis.totalTokens)} tokens.`,
    top ? `Top driver: ${top.name} (${formatUsd(top.amount)}, ${formatCompact(top.totalTokens)} tokens).` : "No LiteLLM usage rows were returned for this period.",
    "",
    "The dashboard visuals below are updated with ranked drivers, trend, weekday pattern, and raw rows.",
  ].join("\n");
}

function liteLlmDashboardRecommendations(services, totals, dashboardKind) {
  if (!services.length) {
    return ["No LiteLLM rows were returned for this period. Try a longer lookback or a previous fiscal quarter."];
  }
  const top = services[0];
  const totalSpend = toNumber(totals.spend);
  const share = totalSpend > 0 ? Math.round((top.amount / totalSpend) * 100) : 0;
  const focus = dashboardKind === "llm-usage-by-user" ? "user" : "model";
  return [
    `Start with the top ${focus}, ${top.name}, which represents ${share}% of spend for this dashboard period.`,
    "Use the chat FinOps report tools for downloadable HTML and CSV files when you need an audit artifact.",
  ];
}

function finalizeLiteLlmUserRows(users, rankBy, limit) {
  return finalizeLiteLlmRows(
    users.map((user) => ({
      ...user,
      api_key_count: user.apiKeyHashes?.size || 0,
      top_models: finalizeLiteLlmRows([...user.models.values()], rankBy, 5),
      models: undefined,
      apiKeyHashes: undefined,
    })),
    rankBy,
    limit,
  );
}

function finalizeLiteLlmRows(rows, rankBy, limit) {
  return rows
    .map((row) => ({ ...row }))
    .sort((a, b) => toNumber(b[rankBy]) - toNumber(a[rankBy]))
    .slice(0, limit);
}

function rankForLiteLlmDashboard(dashboardKind) {
  if (dashboardKind === "llm-spend-by-model") return "spend";
  if (dashboardKind === "llm-token-usage" || dashboardKind === "llm-top-models") return "total_tokens";
  return "total_tokens";
}

function normalizeLiteLlmDashboardKind(value) {
  const allowed = new Set(["llm-usage-by-user", "llm-spend-by-model", "llm-token-usage", "llm-top-models"]);
  return allowed.has(String(value)) ? String(value) : "llm-usage-by-user";
}

function newLiteLlmRollup() {
  return {
    totals: emptyLiteLlmMetrics(),
    models: new Map(),
    users: new Map(),
    trend: [],
    days: 0,
    rangesScanned: [],
  };
}

function emptyLiteLlmMetrics() {
  return {
    requests: 0,
    successful_requests: 0,
    failed_requests: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    total_tokens: 0,
    spend: 0,
  };
}

function liteLlmMetricsFrom(source = {}) {
  return {
    requests: toNumber(firstPresent(source, ["api_requests", "requests", "total_requests"])),
    successful_requests: toNumber(firstPresent(source, ["successful_requests", "total_successful_requests"])),
    failed_requests: toNumber(firstPresent(source, ["failed_requests", "total_failed_requests"])),
    prompt_tokens: toNumber(firstPresent(source, ["prompt_tokens", "total_prompt_tokens"])),
    completion_tokens: toNumber(firstPresent(source, ["completion_tokens", "total_completion_tokens"])),
    cache_read_input_tokens: toNumber(firstPresent(source, ["cache_read_input_tokens", "total_cache_read_input_tokens"])),
    cache_creation_input_tokens: toNumber(firstPresent(source, ["cache_creation_input_tokens", "total_cache_creation_input_tokens"])),
    total_tokens: toNumber(firstPresent(source, ["total_tokens", "tokens"])),
    spend: toNumber(firstPresent(source, ["spend", "total_spend", "cost"])),
  };
}

function addLiteLlmMetrics(target, metrics) {
  for (const key of Object.keys(emptyLiteLlmMetrics())) {
    target[key] = toNumber(target[key]) + toNumber(metrics[key]);
  }
}

function liteLlmUserIdentity(apiKeyHash, payload) {
  const metadata = payload?.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
  const value =
    firstPresent(metadata, ["user_id", "user_email", "email", "end_user", "key_alias", "team_id"]) ??
    firstPresent(payload || {}, ["user_id", "user_email", "email", "end_user", "key_alias", "team_id"]);
  if (value !== undefined && value !== null && value !== "") {
    return { userId: String(value), displayName: String(value) };
  }
  const shortHash = String(apiKeyHash || "unknown").slice(0, 12);
  return { userId: `api_key:${shortHash}`, displayName: `api_key:${shortHash}` };
}

function firstPresent(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function dateRangeForLookback(days) {
  const safeDays = clampNumber(days, 1, 120);
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - safeDays + 1);
  return {
    startDate: isoDate(start),
    endDate: isoDate(end),
  };
}

function monthRanges(startDate, endDate) {
  const ranges = [];
  let cursor = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  while (cursor <= end) {
    const segmentEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const actualEnd = segmentEnd < end ? segmentEnd : end;
    ranges.push({ startDate: isoDate(cursor), endDate: isoDate(actualEnd) });
    cursor = new Date(Date.UTC(actualEnd.getUTCFullYear(), actualEnd.getUTCMonth(), actualEnd.getUTCDate() + 1));
  }
  return ranges;
}

function parseIsoDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDate(value) {
  return value.toISOString().slice(0, 10);
}

function normalizeIsoDate(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const parsed = parseIsoDate(raw);
  return Number.isNaN(parsed.getTime()) || isoDate(parsed) !== raw ? "" : raw;
}

function daysBetweenInclusive(startDate, endDate) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / msPerDay) + 1);
}

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatUsd(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(toNumber(value));
}

function formatCompact(value) {
  return new Intl.NumberFormat("en-US", {
    notation: Math.abs(toNumber(value)) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(toNumber(value)) >= 1_000_000 ? 1 : 0,
  }).format(toNumber(value));
}


function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function normalizeBasePath(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed === "/") return "/";
  return trimmed.startsWith("/") ? trimmed.replace(/\/+$/, "") : `/${trimmed.replace(/\/+$/, "")}`;
}

function normalizeDataSource(value) {
  return "aws-cost-explorer";
}

function agentIdForDataSource(value) {
  return defaultAwsAgentId;
}

function renderAwsProfileOptions() {
  if (!configuredAwsAccounts.length) {
    return '<option value="">Environment credentials</option>';
  }
  const placeholder = defaultAwsProfile
    ? ""
    : '<option value="" selected disabled>Select an AWS account</option>';
  return placeholder + configuredAwsAccounts.map(({ profile }) =>
    `<option value="${escapeHtml(profile)}"${profile === defaultAwsProfile ? " selected" : ""}>${escapeHtml(profile)}</option>`
  ).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
