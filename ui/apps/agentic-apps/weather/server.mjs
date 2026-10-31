#!/usr/bin/env node

// assisted-by Codex Codex-sonnet-4-6
import { createServer } from "node:http";

import { handleAppMcpRequest } from "../../_lib/app-mcp-server.mjs";
import { renderAgenticAppConversationClient } from "../../_lib/conversation-client.mjs";
import { createRequiredAgenticAppJwtVerifier } from "../../_lib/jwt-verify.mjs";
import { renderMicrofrontendClient } from "../../_lib/microfrontend-client.mjs";
import { dashboardStyles } from "../../_lib/dashboard-styles.mjs";
import { weatherStyles } from "./styles.mjs";
import { authorizeAgenticAppRuntimeRequest } from "../../_lib/runtime-authorization.mjs";
import {
  resolveAgenticAppRuntimeBasePath,
  resolveAgenticAppSurface,
} from "../../_lib/runtime-base-path.mjs";
import { renderStaticDashboardExample } from "../../_lib/static-dashboard-examples.mjs";
import { fetchWeatherDashboard } from "./provider.mjs";
import { registerWeatherMcpTools } from "./mcp.mjs";

const port = Number(process.env.WEATHER_APP_PORT ?? "3020");
const configuredBasePath = normalizeBasePath(process.env.WEATHER_APP_BASE_PATH ?? "/apps/weather");
const defaultCity = "San Jose";
const configuredWeatherAgentId = String(process.env.WEATHER_AGENT_ID || "").trim();
const defaultAgentId = configuredWeatherAgentId || "agent-weather-agent";
const weatherAgentConfigured = configuredWeatherAgentId.length > 0;
const verifier = createRequiredAgenticAppJwtVerifier({
  appId: "weather",
  disabled: process.env.AGENTIC_APP_WEATHER_JWT_DISABLED === "true",
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const basePath = resolveAgenticAppRuntimeBasePath(request.headers, configuredBasePath, "weather");
  const surface = resolveAgenticAppSurface(request.headers);

  if (["/health/live", "/health/ready", "/healthz"].includes(url.pathname)) {
    sendJson(response, 200, {
      ok: true,
      app: "weather",
      runtime: "separate-process",
      dataSource: "caipe-weather-agent",
      copilotKit: "embedded-caipe-agent-action-panel",
      agentId: defaultAgentId,
      agentConfigured: weatherAgentConfigured,
      mcp: { endpoint: "/mcp", authentication: "forwarded-bearer" },
    });
    return;
  }

  if (url.pathname === "/mcp") {
    await handleAppMcpRequest(request, response, {
      name: "weather-app",
      authenticationDisabled: process.env.AGENTIC_APP_WEATHER_MCP_AUTH_DISABLED === "true",
      registerTools(mcpServer) {
        registerWeatherMcpTools(mcpServer, {
          fetchDashboard: fetchWeatherDashboard,
          buildResponse: buildProviderWeatherResponse,
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
    appId: "weather",
    method: request.method,
    readScope: "weather:read",
    invokeScope: "weather:agent",
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
      appId: "weather",
      route: "/apps/weather",
      title: "Weather Lab",
      agentId: defaultAgentId,
      mcpServerId: "weather_app",
      domainAnswersRequireMcp: true,
      suggestedPrompts: [
        "How is my day based on the current weather context?",
        "Explain active weather and air quality risks.",
        "Find the best outdoor or travel window.",
      ],
    });
    return;
  }

  if (url.pathname === "/api/copilotkit/weather-agent" && request.method === "POST") {
    try {
      const body = await readJsonBody(request);
      const city = normalizeCity(body?.city);
      const intent = normalizeIntent(body?.intent);
      const question = String(body?.question || "").trim();
      const forecast = await fetchWeatherDashboard(city);
      sendJson(response, 200, buildProviderWeatherResponse(forecast, intent, question));
    } catch (error) {
      sendJson(response, 502, {
        error: "weather_provider_unavailable",
        message: error instanceof Error ? error.message : "Could not load live weather providers",
      });
    }
    return;
  }

  if (url.pathname === "/api/ag-ui/weather-layout") {
    const city = normalizeCity(url.searchParams.get("city"));
    sendJson(response, 200, buildAgUiWeatherEnvelope(buildAgentUnavailableWeatherDashboard(city), "forecast-summary"));
    return;
  }

  if (url.pathname === "/example") {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(renderStaticDashboardExample("weather", authorization.summary));
    return;
  }

  if (url.pathname === "/" || url.pathname === "/dashboard") {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(renderDashboard({ compact: surface === "hosted", basePath, appPath: configuredBasePath }));
    return;
  }

  sendJson(response, 404, { error: "not_found" });
});

server.listen(port, () => {
  console.log(`Weather Lab listening on http://localhost:${port}`);
  console.log(`Configure CAIPE with AGENTIC_APP_WEATHER_ORIGIN=http://localhost:${port}`);
});

function buildAgentUnavailableWeatherDashboard(city, reason = "No Weather structured output received from the CAIPE Weather agent") {
  return {
    source: "agent-unavailable",
    reason,
    city: normalizeCity(city),
    region: "",
    country: "",
    observedAt: new Date().toISOString(),
    current: {
      temperatureC: null,
      apparentC: null,
      humidity: null,
      windKmh: null,
      code: null,
      condition: "Agent output pending",
    },
    daily: [],
    hourly: [],
    airQuality: {
      available: false,
      reason,
    },
    nationalWeatherAlerts: {
      available: false,
      reason,
      alerts: [],
    },
    dailyGuidance: {
      verdict: "Weather agent output pending",
      howIsMyDay: reason,
      riskSignals: ["Agent structured output required"],
    },
    recommendations: [
      "Verify the CAIPE Weather agent is reachable and has the structured response middleware enabled.",
      "Confirm the agent prompt requests weather.dashboard.v1 before the final answer.",
    ],
  };
}

function buildProviderWeatherResponse(forecast, intent, question = "") {
  const summary = forecast.dailyGuidance?.howIsMyDay || `${forecast.city}: live weather loaded.`;
  return {
    message: [
      summary,
      question ? `Question: ${question}` : "",
      forecast.recommendations?.[0] ? `Recommendation: ${forecast.recommendations[0]}` : "",
    ].filter(Boolean).join(" "),
    intent,
    forecast,
    provider_fallback: true,
    agUi: buildAgUiWeatherEnvelope(forecast, intent),
    copilotKit: {
      pattern: "useCopilotAction",
      actionName: "renderWeatherInsight",
      status: "provider-fallback",
    },
  };
}

function buildAgUiWeatherEnvelope(forecast, intent) {
  const runId = `weather-${Date.now()}`;
  return {
    protocol: "ag-ui",
    version: "1.0",
    runId,
    intent,
    generatedBy: {
      agentId: "weather-agent",
      copilotKitPrimitive: "useCopilotAction",
      actionName: "renderWeatherInsight",
    },
    events: [
      { type: "RUN_STARTED", runId },
      { type: "STATE_DELTA", path: "weather.current", value: forecast.current },
      {
        type: "UI_RENDER",
        component: "WeatherHeroCard",
        props: { city: forecast.city, region: forecast.region, current: forecast.current },
      },
      { type: "UI_RENDER", component: "DailyGuidanceCard", props: forecast.dailyGuidance },
      { type: "UI_RENDER", component: "AirQualityPanel", props: forecast.airQuality },
      { type: "UI_RENDER", component: "NationalWeatherAlerts", props: forecast.nationalWeatherAlerts },
      { type: "UI_RENDER", component: "TemperatureSparkline", props: forecast.hourly },
      { type: "UI_RENDER", component: "SevenDayForecast", props: forecast.daily },
      { type: "RUN_FINISHED", runId },
    ],
  };
}

function buildWeatherDashboardResponseFormat() {
  return {
    type: "json_schema",
    schema_id: "weather.dashboard.v1",
    schema: {
      type: "object",
      required: ["summary", "risks", "airQualitySummary", "alertSummary", "snowSummary", "recommendations", "bestWindow", "confidence"],
      properties: {
        summary: { type: "string" },
        risks: { type: "array" },
        airQualitySummary: { type: "string" },
        alertSummary: { type: "string" },
        snowSummary: { type: "string" },
        recommendations: { type: "array" },
        bestWindow: { type: "string" },
        confidence: { type: "string" },
      },
    },
  };
}

function renderDashboard({ compact, basePath, appPath }) {
  const city = escapeHtml(defaultCity);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Weather Lab</title>
    <style>${dashboardStyles}\n${weatherStyles}</style>
  </head>
  <body class="${compact ? "compact" : "standalone"}">
    <main>
      <header class="page-header">
        <div><h1>Weather Lab</h1><p class="subtitle">Current conditions, forecasts, air quality, and weather alerts.</p></div>
        <div class="actions"><a class="button" href="${basePath}/example">Static example</a><button id="openAssistantChat" type="button">Ask Weather</button></div>
      </header>
      <section class="panel scope-panel" aria-label="Weather scope">
        <div class="controls">
          <label class="grow">City<input id="cityInput" value="${city}" aria-label="City" /></label>
          <label>Temperature unit<select id="unitToggle" aria-label="Temperature unit"><option value="fahrenheit" selected>Fahrenheit</option><option value="celsius">Celsius</option></select></label>
          <button id="loadWeather" class="primary">${weatherAgentConfigured ? "Refresh with agent" : "Refresh live weather"}</button>
          <span class="dashboard-status" id="dashboardStatus" title="No forecast loaded yet." role="status" aria-live="polite"><span class="status-dot" aria-hidden="true"></span>Updated: loading</span>
        </div>
        <details class="view-settings"><summary>View settings and saved forecasts</summary>
          <div class="run-history"><select id="runHistory" aria-label="Previous Weather Agent runs"><option value="">No previous runs loaded yet</option></select><button id="loadSelectedRun" type="button">Load run</button></div>
      <div class="font-customizer font-dock" id="fontCustomizer" aria-label="Font customization">
        <span class="font-dock-title">View settings</span>
        <label>
          Font
          <select id="fontFamilySelect" aria-label="Font family">
            <option value="inter">Inter</option>
            <option value="system">System</option>
            <option value="mono">Mono</option>
            <option value="serif">Serif</option>
          </select>
        </label>
        <label>
          Size
          <select id="fontScaleSelect" aria-label="Text size">
            <option value="small">Small</option>
            <option value="default">Default</option>
            <option value="large">Large</option>
            <option value="xl">XL</option>
          </select>
        </label>
      </div>
        </details>
      </section>

      <section class="summary-section">
        <div class="section-heading"><h2>Current conditions</h2><p id="locationTitle" class="muted">Loading ${city}</p></div>
        <div class="kpi-strip" id="kpiStrip"></div>
        <div class="insights-strip" id="insightsStrip" hidden></div>
      </section>

      <div class="weather-content">
          <div class="panel guidance-panel">
            <h2>How is my day?</h2>
            <div class="insight-card" id="howIsMyDay">
              <strong>Loading daily guidance...</strong>
              <p>Forecast, air quality, and alert context will appear here.</p>
            </div>
          </div>
          <div class="panel conditions-panel">
            <h2>Live conditions detail</h2>
            <div class="metrics" id="metrics"></div>
          </div>
          <div class="panel temperature-panel">
            <h2>24 hour temperature arc</h2>
            <svg class="chart" id="tempChart" viewBox="0 0 720 200" role="img" aria-label="24 hour temperature chart"></svg>
          </div>
          <div class="panel air-quality-panel">
            <h2>Air quality</h2>
            <div id="aqiPanel" class="air-grid"></div>
          </div>
          <div class="panel outlook-panel">
            <h2>7 day outlook</h2>
            <div class="days" id="days"></div>
          </div>
          <div class="panel alerts-panel">
            <h2>National weather alerts</h2>
            <div id="alertRows" class="message">Checking national weather alerts...</div>
          </div>
        <details class="panel copilot">
          <summary>Weather analysis</summary>
          <p class="subtitle">Explore travel plans, outdoor work, and weather risks using the current forecast.</p>
          <div class="assistant-fields">
            <label>Analysis<select id="intent"><option value="forecast-summary">Forecast summary</option><option value="travel-planning">Travel planning</option><option value="deploy-window">Outdoor deploy window</option><option value="snow-conditions">Snow conditions</option><option value="weather-alert-explanation">Risk explanation</option></select></label>
            <label>Question<textarea id="questionInput" class="weather-question-input" aria-label="Weather question" rows="3" placeholder="Ask about the forecast, travel, or weather risks"></textarea></label>
          </div>
          <details class="advanced"><summary>Advanced options</summary><label>Agent identifier<input id="agentId" aria-label="Weather agent id" value="${escapeHtml(defaultAgentId)}" /></label></details>
          <div class="actions"><button id="askCopilot" class="primary">${weatherAgentConfigured ? "Run Weather Agent" : "Refresh live weather"}</button></div>
          <div class="message" id="copilotMessage">Load a forecast, then ask for an insight.</div>
        </details>
      </div>
      <footer class="activity-footer" id="activityFooter">
        <details id="activityDrawer">
          <summary>
            <span class="run-status idle" id="runStatus">
              <span class="status-dot" aria-hidden="true"></span>
              Ready
            </span>
            <span class="activity-summary" id="activitySummary">
              ${weatherAgentConfigured ? "Weather Agent activity appears here during a live run." : "Live provider activity appears here during a refresh."}
            </span>
            <span class="activity-toggle-hint">Details</span>
          </summary>
          <div class="activity-drawer-body">
            <section>
              <h2>${weatherAgentConfigured ? "Live Agent Activity" : "Live Provider Activity"}</h2>
              <ol class="timeline" id="agentProgress">
                <li data-step="idle" class="done">
                  <span class="activity-icon" aria-hidden="true">✓</span>
                  <span class="activity-content">
                    <span class="activity-time">Idle</span>
                    <span>${weatherAgentConfigured ? "Ready to run live Weather Agent analysis" : "Ready to refresh live weather providers"}</span>
                  </span>
                </li>
              </ol>
            </section>
            <section>
              <h2>Streamed Weather Report</h2>
              <div class="message stream-content markdown-report" id="streamedContent">
                Streamed agent content will appear here during a live run.
              </div>
            </section>
            <details class="debug-events">
              <summary>Debug events (<span id="debugEventCount">0</span>)</summary>
              <ol class="timeline" id="debugProgress"></ol>
            </details>
          </div>
        </details>
      </footer>
    </main>

    ${renderAgenticAppConversationClient()}
    ${renderMicrofrontendClient("weather")}
    <script>
      const basePath = ${JSON.stringify(basePath)};
      const appPath = ${JSON.stringify(appPath)};
      const weatherAgentConfigured = ${JSON.stringify(weatherAgentConfigured)};
      const state = {
        forecast: null,
        lastAgentMessage: "",
        runs: [],
        activityEventCount: 0,
        debugEventCount: 0,
        unit: "fahrenheit",
      };
      const fontStorageKey = "agentic-app.fontPreferences";

      const cityInput = document.getElementById("cityInput");
      const locationTitle = document.getElementById("locationTitle");
      const metrics = document.getElementById("metrics");
      const days = document.getElementById("days");
      const tempChart = document.getElementById("tempChart");
      const copilotMessage = document.getElementById("copilotMessage");
      const howIsMyDay = document.getElementById("howIsMyDay");
      const aqiPanel = document.getElementById("aqiPanel");
      const alertRows = document.getElementById("alertRows");
      const dashboardStatus = document.getElementById("dashboardStatus");
      const unitToggle = document.getElementById("unitToggle");
      const questionInput = document.getElementById("questionInput");
      const fontFamilySelect = document.getElementById("fontFamilySelect");
      const fontScaleSelect = document.getElementById("fontScaleSelect");
      const kpiStrip = document.getElementById("kpiStrip");
      const insightsStrip = document.getElementById("insightsStrip");

      document.getElementById("loadWeather").addEventListener("click", runWeatherAgent);
      document.getElementById("askCopilot").addEventListener("click", runWeatherAgent);
      document.getElementById("openAssistantChat").addEventListener("click", openAssistantChat);
      document.getElementById("loadSelectedRun").addEventListener("click", loadSelectedRun);
      document.getElementById("runHistory").addEventListener("change", loadSelectedRun);
      fontFamilySelect.addEventListener("change", () => writeFontPreferences());
      fontScaleSelect.addEventListener("change", () => writeFontPreferences());
      unitToggle.addEventListener("change", () => {
        state.unit = unitToggle.value === "celsius" ? "celsius" : "fahrenheit";
        if (state.forecast) renderForecast(state.forecast);
      });
      window.addEventListener("caipe:microfrontend-initialize", (event) => {
        const preferredUnits = event.detail?.preferences?.units;
        if (preferredUnits !== "us" && preferredUnits !== "metric") return;
        state.unit = preferredUnits === "metric" ? "celsius" : "fahrenheit";
        unitToggle.value = state.unit;
        if (state.forecast) renderForecast(state.forecast);
      });
      cityInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") runWeatherAgent();
      });

      applyFontPreferences();
      loadCachedWeather().then((loaded) => {
        if (!loaded) loadWeather(cityInput.value);
      });

      async function loadWeather(city) {
        copilotMessage.textContent = "Loading live weather provider data...";
        setDashboardStatus("loading", "Loading weather...", "Fetching live forecast and air-quality providers.");
        const response = await fetch(appUrl("/api/copilotkit/weather-agent"), {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ city, intent: "forecast-summary" }),
        });
        if (!response.ok) {
          const failure = await response.json().catch(() => ({}));
          copilotMessage.textContent = failure.message || "Live weather providers failed: " + response.status;
          setDashboardStatus("error", "Weather providers unavailable", failure.message || "The Weather app could not load live provider data.");
          return;
        }
        const result = await response.json();
        state.forecast = normalizeForecast(result.forecast || {}, city);
        renderForecast(state.forecast);
        publishAssistantContext(state.forecast);
        setDashboardStatus("done", "Live weather loaded", dashboardStatusDetail(state.forecast));
        copilotMessage.textContent = "Live Open-Meteo data loaded. Run the Weather Agent for an agent-generated interpretation.";
      }

      async function loadCachedWeather() {
        try {
          const response = await fetch("/api/agentic-apps/weather-cache", {
            headers: { accept: "application/json" },
          });
          if (!response.ok) return false;
          const result = await response.json();
          const cached = result.data?.item;
          state.runs = Array.isArray(result.data?.items) ? result.data.items : cached ? [cached] : [];
          renderRunHistory();
          if (!cached?.payload) return false;
          applyRun(cached);
          copilotMessage.textContent =
            "Loaded latest successful Weather Agent run from " + new Date(cached.updatedAt).toLocaleString() + ".";
          setDashboardStatus("done", "Updated " + new Date(cached.updatedAt).toLocaleTimeString(), dashboardStatusDetail(state.forecast));
          return true;
        } catch {
          return false;
        }
      }

      async function saveCachedWeather(agentId, city, intent, unit, forecast, content) {
        try {
          const response = await fetch("/api/agentic-apps/weather-cache", {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({
              agentId,
              city,
              intent,
              unit,
              payload: forecast,
              lastAgentMessage: content,
            }),
          });
          if (response.ok) {
            const result = await response.json();
            state.runs = Array.isArray(result.data?.items)
              ? result.data.items
              : result.data?.item
                ? [result.data.item]
                : state.runs;
            renderRunHistory();
          }
        } catch {
          // Persistence failure should not block the live weather dashboard.
        }
      }

      function applyRun(run) {
        if (!run?.payload) return;
        state.forecast = normalizeForecast(run.payload, run.city || cityInput.value);
        state.lastAgentMessage = run.lastAgentMessage || JSON.stringify(run.payload, null, 2);
        state.unit = run.unit === "celsius" ? "celsius" : "fahrenheit";
        unitToggle.value = state.unit;
        cityInput.value = state.forecast.city || run.city || cityInput.value;
        renderForecast(state.forecast);
        renderMarkdownReport(document.getElementById("streamedContent"), state.lastAgentMessage);
        publishAssistantContext(state.forecast);
        setDashboardStatus(
          "done",
          "Updated " + new Date(run.updatedAt || run.createdAt || Date.now()).toLocaleTimeString(),
          dashboardStatusDetail(state.forecast),
        );
      }

      function renderRunHistory() {
        const selector = document.getElementById("runHistory");
        if (!state.runs.length) {
          selector.innerHTML = '<option value="">No previous runs loaded yet</option>';
          return;
        }
        selector.innerHTML = state.runs.map((run, index) => {
          const payload = run.payload || {};
          const cityLabel = payload.city || run.city || "Weather";
          const condition = payload.current?.condition || "forecast";
          const label = [
            index === 0 ? "Latest" : "Previous",
            new Date(run.updatedAt || run.createdAt).toLocaleString(),
            cityLabel,
            run.intent || "forecast-summary",
            condition,
          ].join(" • ");
          return '<option value="' + escapeAttribute(run.runId || String(index)) + '">' + escapeHtml(label) + '</option>';
        }).join("");
      }

      function loadSelectedRun() {
        const runId = document.getElementById("runHistory").value;
        const run = state.runs.find((item) => String(item.runId) === String(runId)) || state.runs[0];
        if (!run) return;
        applyRun(run);
        copilotMessage.textContent =
          "Loaded saved Weather Agent run from " + new Date(run.updatedAt || run.createdAt).toLocaleString() + ".";
      }

      async function runWeatherAgent() {
        const agentId = document.getElementById("agentId").value.trim() || ${JSON.stringify(defaultAgentId)};
        const userQuestion = questionInput.value.trim();
        const requestedCity = extractCityFromQuestion(userQuestion);
        const city = requestedCity || cityInput.value || ${JSON.stringify(defaultCity)};
        cityInput.value = city;
        const intent = inferIntent(userQuestion, document.getElementById("intent").value);
        initializeActivityFeed();
        setRunButtonBusy(true);
        setDashboardStatus("active", "Updating...", "Agent: " + agentId + "\\nCity: " + city + "\\nIntent: " + intent);
        copilotMessage.textContent = "Calling CAIPE dynamic agent " + agentId + "...";
        const prompt = [
          "Answer this weather question for " + city + ": " + (userQuestion || "Build a weather dashboard insight with intent " + intent) + ".",
          "Use the configured weather tools to fetch current provider data for the requested location.",
          "Include forecast, air pollution, national weather alerts, selected temperature unit " + state.unit + ", and a practical 'How is my day?' recommendation.",
          "If the user asks about snow conditions, focus on snow signal, freezing temperature risk, precipitation probability, wind, travel risk, and whether fresh snow is likely.",
          "Use submit_structured_response with the requested weather.dashboard.v1 schema before the final explanation.",
          "Return a short explanation after submitting structured output.",
          "Do not invent weather values."
        ].join(" ");

        let result;
        try {
          if (!weatherAgentConfigured) {
            throw new Error("No CAIPE Weather Agent is configured for this runtime");
          }
          updateAgentProgress("agent", "Running CAIPE structured invoke", "Agent: " + agentId);
          const invokeResult = await invokeAgenticApp({
            agentId,
            appId: "weather",
            title: "Weather dashboard · " + city,
            message: prompt,
            clientContext: {
              dashboardKind: intent,
              city,
              userQuestion,
              unit: state.unit,
              response_format: ${JSON.stringify(buildWeatherDashboardResponseFormat())},
            },
          });
          updateAgentProgress("shape", "Shaping weather dashboard output", invokeResult.structured_output ? "Structured weather output received from invoke." : "No weather.dashboard.v1 structured output received.");
          appendStreamContent(invokeResult.content || "");
          result = {
            content: invokeResult.content || "",
            structured_output: invokeResult.structured_output || null,
          };
          if (!result.structured_output) {
            throw new Error("No Weather structured output received from the CAIPE Weather agent");
          }
        } catch (error) {
          updateAgentProgress(
            "fallback",
            weatherAgentConfigured ? "Weather Agent unavailable; using providers" : "Live provider mode",
            error instanceof Error ? error.message : "Using live weather providers.",
          );
          const local = await fetch(appUrl("/api/copilotkit/weather-agent"), {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ city, intent, question: userQuestion }),
          });
          result = await local.json();
          if (!local.ok) {
            copilotMessage.textContent = result.message || "Weather Agent failed.";
            updateAgentProgress("error", "Weather Agent failed", result.message || "Local fallback failed.");
            setDashboardStatus("error", "Weather Agent failed", result.message || "Local fallback failed.");
            setRunButtonBusy(false);
            return;
          }
          appendStreamContent(result.message || JSON.stringify(result, null, 2));
          updateAgentProgress("shape", "Live providers returned weather data", "Open-Meteo fallback completed without bypassing agent authorization.");
        }

        const content = result.structured_output
          ? JSON.stringify(result.structured_output, null, 2)
          : result.content || result.message || JSON.stringify(result, null, 2);
        const insight = result.structured_output || result.forecast || extractFirstJsonObject(content);
        state.forecast = normalizeForecast(insight, city);
        state.lastAgentMessage = content;
        renderForecast(state.forecast);
        if (result.structured_output || result.provider_fallback) {
          updateAgentProgress("save", "Saving run history", "Captured " + state.forecast.daily.length + " daily rows, " + state.forecast.hourly.length + " hourly points, and " + (state.forecast.nationalWeatherAlerts?.alerts?.length || 0) + " alerts.");
          await saveCachedWeather(agentId, city, intent, state.unit, state.forecast, content);
          updateAgentProgress(
            "done",
            "Run complete",
            result.structured_output
              ? "Dashboard updated from structured Weather Agent invoke."
              : "Dashboard updated from live Open-Meteo provider fallback.",
          );
          setDashboardStatus("done", "Updated " + new Date().toLocaleTimeString(), dashboardStatusDetail(state.forecast));
        }
        const message = insight?.summary || content;
        copilotMessage.innerHTML =
          "<strong>" + (result.structured_output ? "Weather Agent" : "Live weather providers") + ":</strong> " + escapeHtml(message);
        if (insight?.recommendations?.length) {
          copilotMessage.innerHTML += "<br><br>" + insight.recommendations.map((item) => "• " + escapeHtml(item)).join("<br>");
        }
        window.parent?.postMessage({
          type: "caipe.agenticApp.context.v1",
          version: "1.0",
          appId: "weather",
          context: {
            route: appPath,
            title: result.structured_output ? "Weather Agent Insight" : "Live Weather Insight",
            summary: message,
            selection: JSON.stringify({ forecast: compactForecast(state.forecast), agentOutput: content, userQuestion }).slice(0, 3000),
            resourceRefs: result.structured_output
              ? [
                  { kind: "datasource", id: "open-meteo" },
                  { kind: "agent", id: agentId },
                ]
              : [{ kind: "datasource", id: "open-meteo" }],
            suggestedPrompts: [
              "Explain this forecast risk in plain language.",
              "Find the best travel window from this weather context.",
              "Summarize how this forecast affects outdoor work.",
            ],
          },
        }, window.location.origin);
        setRunButtonBusy(false);
      }

      function initializeActivityFeed() {
        document.getElementById("activityDrawer").open = true;
        document.getElementById("agentProgress").innerHTML = "";
        document.getElementById("debugProgress").innerHTML = "";
        document.getElementById("debugEventCount").textContent = "0";
        renderMarkdownReport(document.getElementById("streamedContent"), "");
        state.activityEventCount = 0;
        state.debugEventCount = 0;
        updateActivitySummary(weatherAgentConfigured ? "Starting live Weather Agent run..." : "Starting live provider refresh...");
        setRunStatus("active", "Starting");
      }

      function updateAgentProgress(step, label, detail = "") {
        const status = step === "done" ? "done" : step === "error" ? "error" : "active";
        if (status === "done") {
          setRunStatus("done", "Complete");
        } else if (status === "error") {
          setRunStatus("error", "Needs attention");
        } else if (step === "tool-start") {
          setRunStatus("active", "Using tool");
        } else if (step === "fallback") {
          setRunStatus("active", "Fallback");
        } else {
          setRunStatus("active", "Streaming");
        }
        appendActivityEvent(step, label || step, detail, status);
      }

      function appendActivityEvent(step, label, detail = "", status = "active", options = {}) {
        const isDebug = options.debug === true;
        const list = document.getElementById(isDebug ? "debugProgress" : "agentProgress");
        const item = document.createElement("li");
        item.dataset.step = step;
        item.className = status === "error" ? "error" : status === "done" ? "done" : "active";
        const icon = document.createElement("span");
        icon.className = "activity-icon";
        icon.setAttribute("aria-hidden", "true");
        if (status === "active") {
          const spinner = document.createElement("span");
          spinner.className = "activity-spinner";
          icon.replaceChildren(spinner);
        } else {
          icon.textContent = status === "done" ? "✓" : "!";
        }
        const content = document.createElement("span");
        content.className = "activity-content";
        const time = document.createElement("span");
        time.className = "activity-time";
        time.textContent = new Date().toLocaleTimeString();
        const text = document.createElement("span");
        text.textContent = label;
        content.append(time, text);
        if (detail) {
          const detailNode = document.createElement("span");
          detailNode.className = "activity-detail";
          detailNode.textContent = detail;
          content.append(detailNode);
        }
        item.append(icon, content);
        list.prepend(item);
        if (isDebug) {
          state.debugEventCount += 1;
          document.getElementById("debugEventCount").textContent = String(state.debugEventCount);
        } else {
          state.activityEventCount += 1;
        }
        updateActivitySummary(buildActivitySummary(status));
      }

      function setRunStatus(status, label) {
        const node = document.getElementById("runStatus");
        node.className = "run-status " + status;
        const dot = document.createElement("span");
        dot.className = "status-dot";
        dot.setAttribute("aria-hidden", "true");
        node.replaceChildren(dot, document.createTextNode(label));
      }

      function updateActivitySummary(text) {
        document.getElementById("activitySummary").textContent = text;
      }

      function buildActivitySummary(status) {
        const visible = state.activityEventCount + " event" + (state.activityEventCount === 1 ? "" : "s");
        const debug = state.debugEventCount ? " • " + state.debugEventCount + " debug" : "";
        if (status === "error") return "Needs attention • " + visible + debug;
        if (status === "done") return (weatherAgentConfigured ? "Last Weather Agent run • " : "Last provider refresh • ") + visible + debug;
        return (weatherAgentConfigured ? "Streaming Weather Agent activity • " : "Refreshing live providers • ") + visible + debug;
      }

      function setRunButtonBusy(isBusy) {
        const buttons = [document.getElementById("loadWeather"), document.getElementById("askCopilot")].filter(Boolean);
        for (const button of buttons) {
          if (!button.dataset.defaultLabel) {
            button.dataset.defaultLabel = button.textContent || "Run Weather Agent";
          }
          button.disabled = isBusy;
          button.textContent = isBusy ? "Running live weather analysis..." : button.dataset.defaultLabel;
        }
      }

      function appendStreamContent(chunk) {
        if (!chunk) return;
        setRunStatus("active", "Streaming");
        const target = document.getElementById("streamedContent");
        const nextContent = (target.dataset.markdown || "") + chunk;
        renderMarkdownReport(target, nextContent);
        target.scrollTop = target.scrollHeight;
      }

      async function consumeAgentStream(response) {
        if (!response.body) {
          throw new Error("The CAIPE stream response did not include a readable body.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const streamState = {
          content: "",
          structuredOutput: null,
          structuredOutputSchemaId: "",
          toolNames: {},
          debugTools: {},
        };
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split("\\n\\n");
            buffer = frames.pop() || "";
            for (const frameText of frames) {
              const frame = parseSseFrame(frameText);
              if (frame) handleStreamEvent(frame, streamState);
            }
          }
          if (buffer.trim()) {
            const frame = parseSseFrame(buffer);
            if (frame) handleStreamEvent(frame, streamState);
          }
        } finally {
          reader.releaseLock();
        }

        return streamState;
      }

      function parseSseFrame(frameText) {
        if (!frameText.trim()) return null;
        let event = "message";
        const data = [];
        for (const line of frameText.split("\\n")) {
          if (line.startsWith("event: ")) {
            event = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            data.push(line.slice(6));
          } else if (line.startsWith("data:")) {
            data.push(line.slice(5));
          }
        }
        return { event, data: data.join("\\n") };
      }

      function handleStreamEvent(frame, streamState) {
        const payload = parseJson(frame.data, {});
        if (frame.event === "content") {
          const text = payload.text || "";
          streamState.content += text;
          appendStreamContent(text);
          return;
        }
        if (frame.event === "tool_start") {
          const toolName = payload.tool_name || "weather tool";
          const toolCallId = payload.tool_call_id || "";
          const debug = isDebugTool(toolName);
          if (toolCallId) {
            streamState.toolNames[toolCallId] = toolName;
            streamState.debugTools[toolCallId] = debug;
          }
          if (!debug) {
            setRunStatus("active", "Using tool");
          }
          appendActivityEvent("tool-start", "Calling " + toolName, summarizeToolArgs(payload.args), "active", { debug });
          return;
        }
        if (frame.event === "tool_end") {
          const toolCallId = payload.tool_call_id || "";
          const debug = Boolean(streamState.debugTools[toolCallId]);
          const toolName = streamState.toolNames[toolCallId] || "weather tool";
          setRunStatus("active", "Streaming");
          appendActivityEvent(
            "tool-end",
            payload.error ? toolName + " failed" : toolName + " completed",
            payload.error || "CAIPE returned the tool result to the Weather Agent.",
            payload.error ? "error" : "done",
            { debug },
          );
          return;
        }
        if (frame.event === "structured_output") {
          streamState.structuredOutput = payload.payload || null;
          streamState.structuredOutputSchemaId = payload.schema_id || "";
          setRunStatus("active", "Rendering");
          appendActivityEvent("structured-output", "Received structured weather output", payload.schema_id || "Schema id not provided.", "done");
          return;
        }
        if (frame.event === "warning") {
          setRunStatus("error", "Warning");
          appendActivityEvent("warning", "Agent warning", payload.message || "Non-fatal stream warning.", "error");
          return;
        }
        if (frame.event === "error") {
          setRunStatus("error", "Failed");
          appendActivityEvent("error", "Agent stream failed", payload.error || "Unknown stream error.", "error");
          return;
        }
        if (frame.event === "done") {
          setRunStatus("active", "Rendering");
          appendActivityEvent("stream-done", "Stream finished", "Rendering Weather Agent report.", "done");
        }
      }

      function isDebugTool(toolName) {
        return new Set(["glob", "grep", "ls", "read", "read_file", "task"]).has(String(toolName || "").toLowerCase());
      }

      function summarizeToolArgs(args) {
        if (!args || typeof args !== "object") return "";
        try {
          return JSON.stringify(args).slice(0, 220);
        } catch {
          return "";
        }
      }

      function parseJson(value, fallback) {
        try {
          return JSON.parse(value);
        } catch {
          return fallback;
        }
      }

      function extractCityFromQuestion(question) {
        const text = String(question || "").trim();
        const match = text.match(/\\b(?:in|near|around|for)\\s+([A-Za-z][A-Za-z .'-]{1,60})(?:[?.!,]|$)/i);
        if (!match) return "";
        return match[1].trim().replace(/\\s+/g, " ");
      }

      function inferIntent(question, selectedIntent) {
        const text = String(question || "").toLowerCase();
        if (text.includes("snow") || text.includes("ski") || text.includes("powder")) {
          return "snow-conditions";
        }
        return selectedIntent || "forecast-summary";
      }

      function appUrl(path) {
        const normalizedPath = String(path || "/").startsWith("/") ? String(path || "/") : "/" + String(path || "/");
        const normalizedBase = basePath.replace(/\\/+$/, "");
        const currentPath = window.location.pathname.replace(/\\/+$/, "") || "/";
        const underProxy = normalizedBase !== "/" && (currentPath === normalizedBase || currentPath.startsWith(normalizedBase + "/"));
        return underProxy ? normalizedBase + normalizedPath : normalizedPath;
      }

      function numberOrNull(...values) {
        const value = values.find((candidate) => candidate !== null && candidate !== undefined && candidate !== "");
        if (value === undefined) return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
      }

      function normalizeForecast(value, fallbackCity) {
        const forecast = value && typeof value === "object" ? value : {};
        const current = forecast.current && typeof forecast.current === "object" ? forecast.current : {};
        return {
          ...forecast,
          city: forecast.city || fallbackCity || ${JSON.stringify(defaultCity)},
          region: forecast.region || "",
          country: forecast.country || "",
          observedAt: forecast.observedAt || new Date().toISOString(),
          current: {
            temperatureC: numberOrNull(current.temperatureC, current.tempC),
            apparentC: numberOrNull(current.apparentC, current.feelsLikeC, current.temperatureC, current.tempC),
            humidity: numberOrNull(current.humidity),
            windKmh: numberOrNull(current.windKmh, current.windSpeedKmh),
            code: numberOrNull(current.code),
            condition: current.condition || "Agent output pending",
          },
          daily: Array.isArray(forecast.daily) ? forecast.daily : [],
          hourly: Array.isArray(forecast.hourly) ? forecast.hourly : [],
          airQuality: forecast.airQuality || { available: false, reason: forecast.reason || "Air quality requires Weather Agent output." },
          nationalWeatherAlerts: forecast.nationalWeatherAlerts || { available: false, reason: forecast.reason || "Alerts require Weather Agent output.", alerts: [] },
          dailyGuidance: forecast.dailyGuidance || {
            verdict: "Weather agent output pending",
            howIsMyDay: forecast.reason || "Run the Weather Agent to populate this dashboard.",
            riskSignals: ["Agent structured output required"],
          },
          recommendations: Array.isArray(forecast.recommendations) ? forecast.recommendations : [],
        };
      }

      function extractFirstJsonObject(content) {
        const start = String(content).indexOf("{");
        const end = String(content).lastIndexOf("}");
        if (start < 0 || end <= start) return null;
        try {
          return JSON.parse(String(content).slice(start, end + 1));
        } catch {
          return null;
        }
      }

      function renderForecast(forecast) {
        locationTitle.textContent = forecast.city + (forecast.region ? ", " + forecast.region : "");
        renderKpiStrip(forecast);
        renderInsights(forecast);
        renderDailyGuidance(forecast);
        const hourlyPanel = tempChart.closest(".panel");
        const dailyPanel = days.closest(".panel");
        if (hourlyPanel) hourlyPanel.hidden = forecast.hourly.length === 0;
        if (dailyPanel) dailyPanel.hidden = forecast.daily.length === 0;
        metrics.replaceChildren(
          metric("Temperature", formatTemperature(forecast.current.temperatureC), "Temp"),
          metric("Feels Like", formatTemperature(forecast.current.apparentC), "Feel"),
          metric("Wind", forecast.current.windKmh == null ? "—" : forecast.current.windKmh + " km/h", "Wind"),
          metric("Humidity", forecast.current.humidity == null ? "—" : forecast.current.humidity + "%", "Hum"),
        );
        days.replaceChildren(...forecast.daily.map((day) => {
          const node = document.createElement("div");
          node.className = "day";
          node.tabIndex = 0;
          node.setAttribute("role", "button");
          node.setAttribute("aria-label", "Share " + day.label + " forecast with CAIPE");
          node.addEventListener("click", () => publishAssistantContext(forecast, day));
          node.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); publishAssistantContext(forecast, day); }
          });
          node.innerHTML =
            '<div class="day-header">' +
              "<strong>" + escapeHtml(day.label) + "</strong>" +
              '<span class="weather-icon" aria-hidden="true">' + escapeHtml(weatherCodeToIcon(day.code)) + "</span>" +
            "</div>" +
            '<div class="condition">' + escapeHtml(day.condition) + "</div>" +
            '<div class="forecast-temps">' +
              formatTemperature(day.highC) +
              ' <span class="low">/ ' + formatTemperature(day.lowC) + "</span>" +
            "</div>" +
            '<div class="forecast-meta">' +
              '<span class="forecast-chip">Rain ' + day.rainChance + "%</span>" +
              '<span class="forecast-chip">Wind ' + day.windKmh + " km/h</span>" +
            "</div>";
          return node;
        }));
        renderChart(forecast.hourly);
        renderAirQuality(forecast.airQuality);
        renderNationalWeatherAlerts(forecast.nationalWeatherAlerts);
      }

      function renderKpiStrip(forecast) {
        if (!kpiStrip) return;
        const current = forecast.current || {};
        const city = forecast.city || "Unknown";
        const region = forecast.region || "";
        const condition = current.condition || "Loading...";
        const icon = forecast.source === "agent-unavailable" ? "" : weatherCodeToIcon(current.code);
        if (forecast.source === "agent-unavailable") {
          kpiStrip.innerHTML = [
            weatherKpi({ label: "Location", value: city, sub: region || "Requested location", icon, accent: "attention", valueClass: "kpi-location" }),
            weatherKpi({ label: "Weather data", value: "Unavailable", sub: forecast.reason || "No agent output", accent: "warn" }),
            weatherKpi({ label: "Next step", value: "Run agent", sub: "Retry after checking Weather Agent access", accent: "attention" }),
          ].join("");
          return;
        }
        const today = (forecast.daily && forecast.daily[0]) || null;
        const aq = forecast.airQuality || {};
        const alertCount = (forecast.nationalWeatherAlerts?.alerts || []).length;
        const rainChance = today ? Number(today.rainChance || 0) : 0;
        const aqValue = aq.available ? (aq.usAqi != null ? Math.round(aq.usAqi) : "—") : "—";
        const aqCategory = aq.available ? (aq.category || "") : (aq.reason ? "Unavailable" : "");
        const tempStr = formatTemperature(current.temperatureC);
        const feelsStr = formatTemperature(current.apparentC);
        const windStr = current.windKmh == null ? "—" : current.windKmh + " km/h";

        const tempAccent = "attention";
        const aqAccent = !aq.available ? "attention" : aqValue >= 151 ? "danger" : aqValue >= 101 ? "warn" : aqValue >= 51 ? "attention" : "good";
        const alertAccent = alertCount > 0 ? "danger" : "good";
        const rainAccent = rainChance >= 70 ? "warn" : rainChance >= 40 ? "attention" : "good";
        const windAccent = (current.windKmh || 0) >= 50 ? "warn" : (current.windKmh || 0) >= 25 ? "attention" : "good";

        kpiStrip.innerHTML = [
          weatherKpi({
            label: "Location",
            value: city,
            sub: [region, condition].filter(Boolean).join(" • "),
            icon: icon,
            accent: "attention",
            valueClass: "kpi-location",
          }),
          weatherKpi({
            label: "Now",
            value: tempStr,
            sub: "Feels " + feelsStr,
            accent: tempAccent,
          }),
          weatherKpi({
            label: "Wind",
            value: windStr,
            sub: (current.humidity != null ? current.humidity + "% humidity" : ""),
            accent: windAccent,
          }),
          weatherKpi({
            label: "Rain (today)",
            value: rainChance + "%",
            sub: today ? "High " + formatTemperature(today.highC) + " / " + formatTemperature(today.lowC) : "—",
            accent: rainAccent,
          }),
          weatherKpi({
            label: "Air quality",
            value: String(aqValue),
            sub: aqCategory || "US AQI",
            accent: aqAccent,
          }),
          weatherKpi({
            label: "Active alerts",
            value: String(alertCount),
            sub: alertCount === 0 ? "No NWS alerts" : "NWS alerts active",
            accent: alertAccent,
          }),
        ].join("");

        const locationLabel = document.querySelector(".kpi-location");
        if (locationLabel) {
          locationLabel.style.fontSize = "1.05rem";
          locationLabel.style.overflow = "hidden";
          locationLabel.style.textOverflow = "ellipsis";
          locationLabel.style.whiteSpace = "nowrap";
        }
      }

      function renderInsights(forecast) {
        if (!insightsStrip) return;
        const insights = [];
        const current = forecast.current || {};
        const today = (forecast.daily && forecast.daily[0]) || null;
        const aq = forecast.airQuality || {};
        const alerts = forecast.nationalWeatherAlerts?.alerts || [];
        const guidance = forecast.dailyGuidance || {};
        const rainChance = today ? Number(today.rainChance || 0) : 0;
        const aqValue = aq.available && aq.usAqi != null ? Number(aq.usAqi) : null;

        if (alerts.length > 0) {
          const top = alerts[0];
          insights.push({ icon: "⚠️", title: alerts.length + " active NWS alert" + (alerts.length === 1 ? "" : "s"), sub: top.event || top.headline || "Check national weather alerts" });
        }
        if (aqValue != null && aqValue >= 101) {
          insights.push({ icon: "🌫️", title: "Air quality " + (aq.category || "is poor") + " (AQI " + Math.round(aqValue) + ")", sub: "Sensitive groups should limit outdoor exposure" });
        }
        if (rainChance >= 60) {
          insights.push({ icon: "🌧️", title: rainChance + "% rain chance today", sub: "Plan indoor or covered windows" });
        }
        if ((current.windKmh || 0) >= 40) {
          insights.push({ icon: "💨", title: "High winds (" + current.windKmh + " km/h)", sub: "Outdoor deploys may be affected" });
        }
        if (guidance.bestWindow) {
          const bw = guidance.bestWindow;
          const label = typeof bw === "string" ? bw : (bw.label || "");
          if (label) insights.push({ icon: "🌤️", title: "Best window: " + label, sub: "Optimal outdoor conditions" });
        }
        const firstRisk = Array.isArray(guidance.riskSignals) ? guidance.riskSignals[0] : null;
        if (firstRisk && !insights.find((ins) => ins.title === firstRisk)) {
          insights.push({ icon: "🚩", title: firstRisk, sub: "Agent flagged risk" });
        }
        if (!insights.length && current.condition) {
          insights.push({ icon: "✅", title: "No major weather, air, or alert risks", sub: current.condition });
        }

        if (!insights.length) {
          insightsStrip.hidden = true;
          insightsStrip.innerHTML = "";
          return;
        }
        insightsStrip.hidden = false;
        insightsStrip.innerHTML = insights.slice(0, 4).map((ins) =>
          '<div class="insight">' +
            '<span class="insight-icon" aria-hidden="true">' + escapeHtml(ins.icon) + '</span>' +
            '<div class="insight-text">' +
              '<strong>' + escapeHtml(ins.title) + '</strong>' +
              (ins.sub ? '<small>' + escapeHtml(ins.sub) + '</small>' : '') +
            '</div>' +
          '</div>'
        ).join("");
      }

      function weatherKpi({ label, value, sub, icon, accent = "attention", valueClass = "" }) {
        return (
          '<div class="kpi accent-' + escapeHtml(accent) + '">' +
            '<div class="kpi-label">' + escapeHtml(label) + '</div>' +
            '<div class="kpi-value ' + escapeHtml(valueClass || "") + '">' +
              (icon ? '<span class="kpi-icon" aria-hidden="true">' + escapeHtml(icon) + '</span>' : '') +
              '<span>' + escapeHtml(String(value)) + '</span>' +
            '</div>' +
            (sub ? '<div class="kpi-sub">' + escapeHtml(sub) + '</div>' : '') +
          '</div>'
        );
      }

      function renderDailyGuidance(forecast) {
        const guidance = forecast.dailyGuidance;
        if (!guidance) {
          howIsMyDay.innerHTML = "<strong>No daily guidance yet.</strong><p>Load a forecast to generate guidance.</p>";
          return;
        }
        howIsMyDay.innerHTML =
          "<strong>" + escapeHtml(guidance.verdict) + "</strong>" +
          "<p>" + escapeHtml(displayDailyGuidance(forecast)) + "</p>" +
          '<div class="risk-pills">' +
          (guidance.riskSignals?.length
            ? guidance.riskSignals.map((risk) => '<span class="risk-pill">' + escapeHtml(risk) + '</span>').join("")
            : '<span class="risk-pill">No major risks detected</span>') +
          "</div>";
      }

      function displayDailyGuidance(forecast) {
        const guidance = forecast.dailyGuidance || {};
        if (forecast.source === "agent-unavailable") {
          return forecast.city + ": weather data is unavailable. " + (forecast.reason || "Run the Weather Agent to try again.");
        }
        const bestWindow = guidance.bestWindow
          ? " Best outdoor window looks like " + guidance.bestWindow.label + "."
          : " No clear best outdoor window in the next 24 hours.";
        const risks = guidance.riskSignals?.length
          ? " Watch: " + guidance.riskSignals.join(", ") + "."
          : " No major weather, air, or alert risks are visible right now.";
        return forecast.city + ": " + forecast.current.condition.toLowerCase() + ", " + formatTemperature(forecast.current.temperatureC) + " now." + bestWindow + risks;
      }

      function renderAirQuality(airQuality) {
        if (!airQuality?.available) {
          aqiPanel.innerHTML = '<div class="message">Air quality is unavailable: ' + escapeHtml(airQuality?.reason || "no data") + '</div>';
          return;
        }
        aqiPanel.replaceChildren(
          metric("US AQI", airQuality.usAqi ?? "N/A", airQuality.category || "AQI"),
          metric("PM2.5", airQuality.pm25 ?? "N/A", "ug/m3"),
          metric("Ozone", airQuality.ozone ?? "N/A", "ug/m3"),
        );
      }

      function renderNationalWeatherAlerts(nationalWeatherAlerts) {
        const alerts = nationalWeatherAlerts?.alerts ?? [];
        if (!nationalWeatherAlerts?.available) {
          alertRows.innerHTML = "<strong>Alert feed unavailable</strong><br>" + escapeHtml(nationalWeatherAlerts?.reason || "No alert provider response.");
          return;
        }
        if (!alerts.length) {
          alertRows.innerHTML = "<strong>No active national weather alerts</strong><br>National Weather Service has no active alerts for this point.";
          return;
        }
        alertRows.replaceChildren(...alerts.map((alert) => {
          const node = document.createElement("div");
          node.className = "alert-row";
          node.innerHTML =
            "<strong>" + escapeHtml(alert.event) + " - " + escapeHtml(alert.severity) + "</strong>" +
            "<span>" + escapeHtml(alert.headline) + "</span>" +
            (alert.instruction ? "<span>" + escapeHtml(alert.instruction) + "</span>" : "");
          return node;
        }));
      }

      function renderChart(hourly) {
        const points = hourly.slice(0, 24);
        if (!points.length) {
          tempChart.replaceChildren();
          return;
        }
        const temps = points.map((point) => displayTemperatureValue(point.tempC));
        const min = Math.min(...temps);
        const max = Math.max(...temps);
        const spread = Math.max(1, max - min);
        const path = points.map((point, index) => {
          const x = 28 + index * (664 / Math.max(1, points.length - 1));
          const y = 160 - ((displayTemperatureValue(point.tempC) - min) / spread) * 120;
          return (index === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
        }).join(" ");
        tempChart.innerHTML =
          '<path d="' + path + '" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round"/>' +
          points.filter((_, index) => index % 4 === 0).map((point, index) => {
            const x = 28 + (index * 4) * (664 / Math.max(1, points.length - 1));
            return '<text x="' + x.toFixed(1) + '" y="192" fill="var(--muted)" font-size="11" text-anchor="middle">' + escapeHtml(point.label) + '</text>';
          }).join("") +
          '<text x="20" y="26" fill="var(--text)" font-size="11" font-weight="700">' + max + temperatureSuffix() + ' high</text>' +
          '<text x="20" y="172" fill="var(--text)" font-size="11" font-weight="700">' + min + temperatureSuffix() + ' low</text>';
      }

      function displayTemperatureValue(valueC) {
        if (valueC === null || valueC === undefined || valueC === "") return null;
        return state.unit === "celsius" ? Math.round(Number(valueC)) : cToF(valueC);
      }

      function formatTemperature(valueC) {
        const value = displayTemperatureValue(valueC);
        return value === null ? "—" : value + temperatureSuffix();
      }

      function cToF(valueC) {
        return Math.round((Number(valueC) * 9) / 5 + 32);
      }

      function temperatureSuffix() {
        return state.unit === "celsius" ? "C" : "F";
      }

      function applyFontPreferences(preferences = readFontPreferences()) {
        const families = {
          inter: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          system: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
          serif: 'Georgia, "Times New Roman", serif',
        };
        const scales = { small: "0.9", default: "1", large: "1.15", xl: "1.3" };
        const family = families[preferences.family] ? preferences.family : "inter";
        const scale = scales[preferences.scale] ? preferences.scale : "default";
        document.documentElement.style.setProperty("--app-font-family", families[family]);
        document.documentElement.style.setProperty("--app-font-scale", scales[scale]);
        fontFamilySelect.value = family;
        fontScaleSelect.value = scale;
      }

      function readFontPreferences() {
        try {
          return JSON.parse(localStorage.getItem(fontStorageKey) || "{}");
        } catch {
          return {};
        }
      }

      function writeFontPreferences() {
        const preferences = {
          family: fontFamilySelect.value,
          scale: fontScaleSelect.value,
        };
        try {
          localStorage.setItem(fontStorageKey, JSON.stringify(preferences));
        } catch {}
        applyFontPreferences(preferences);
      }

      function weatherCodeToIcon(code) {
        if (code === 0) return "☀️";
        if ([1, 2].includes(code)) return "🌤️";
        if (code === 3) return "☁️";
        if ([45, 48].includes(code)) return "🌫️";
        if ([51, 53, 55, 56, 57].includes(code)) return "🌦️";
        if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
        if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
        if ([95, 96, 99].includes(code)) return "⛈️";
        return "🌡️";
      }

      function metric(label, value, icon) {
        const node = document.createElement("div");
        node.className = "metric";
        node.innerHTML =
          '<span class="icon" aria-hidden="true">' + escapeHtml(icon || "") + '</span>' +
          '<div class="label">' + escapeHtml(label) + '</div><div class="value">' + escapeHtml(value) + '</div>';
        return node;
      }

      function publishAssistantContext(forecast, selectedDay) {
        window.parent?.postMessage({
          type: "caipe.agenticApp.context.v1",
          version: "1.0",
          appId: "weather",
          context: {
            route: appPath,
            title: "Live weather for " + forecast.city,
            agentId: ${JSON.stringify(defaultAgentId)},
            mcpServerId: "weather_app",
            domainAnswersRequireMcp: true,
            summary: forecast.dailyGuidance?.howIsMyDay || forecast.current.condition + ", " + forecast.current.temperatureC + "C",
            selection: JSON.stringify({ ...compactForecast(forecast), selectedDay }).slice(0, 5000),
            resourceRefs: [
              { kind: "agent", id: "weather-agent" },
              { kind: "schema", id: "weather.dashboard.v1" },
            ],
            suggestedPrompts: [
              "How is my day based on this weather, AQI, and alert context?",
              "Explain active weather and air quality risks in plain language.",
              "Find the best outdoor or travel window.",
            ],
          },
        }, window.location.origin);
      }

      function openAssistantChat() {
        if (state.forecast) publishAssistantContext(state.forecast);
        window.parent?.postMessage({
          type: "caipe.agenticApp.assistant.open.v1",
          version: "1.0",
          appId: "weather",
          prompt: "How is my day based on the current forecast, air pollution, and national weather alerts?",
        }, window.location.origin);
      }

      function compactForecast(forecast) {
        return {
          city: forecast.city,
          region: forecast.region,
          country: forecast.country,
          observedAt: forecast.observedAt,
          unit: state.unit,
          current: forecast.current,
          daily: forecast.daily.slice(0, 7),
          hourly: forecast.hourly.slice(0, 12),
          airQuality: forecast.airQuality,
          nationalWeatherAlerts: forecast.nationalWeatherAlerts,
          dailyGuidance: forecast.dailyGuidance,
          source: forecast.source,
        };
      }

      function setDashboardStatus(status, label, detail) {
        dashboardStatus.className = "dashboard-status " + status;
        dashboardStatus.title = detail || label;
        dashboardStatus.innerHTML = '<span class="status-dot" aria-hidden="true"></span>' + escapeHtml(label);
      }

      function dashboardStatusDetail(forecast) {
        const alertCount = forecast.nationalWeatherAlerts?.alerts?.length ?? 0;
        const aqi = forecast.airQuality?.usAqi ?? "N/A";
        return [
          "Forecast: " + forecast.current.condition + ", " + forecast.current.temperatureC + "C",
          "AQI: " + aqi,
          "Alerts: " + alertCount,
          "Guidance: " + (forecast.dailyGuidance?.verdict || "Unavailable"),
        ].join(" | ");
      }

      function formatShortTime(value) {
        try {
          return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        } catch {
          return "just now";
        }
      }

      function renderMarkdownReport(target, markdown) {
        const source = String(markdown || "");
        target.dataset.markdown = source;
        target.innerHTML = markdownToSafeHtml(source);
      }

      function markdownToSafeHtml(markdown) {
        const codeFence = String.fromCharCode(96, 96, 96);
        const lines = String(markdown).replaceAll("\\r\\n", "\\n").split("\\n");
        const html = [];
        let paragraph = [];
        let listType = "";
        let inCode = false;
        let codeLines = [];

        function flushParagraph() {
          if (!paragraph.length) return;
          html.push("<p>" + renderInlineMarkdown(paragraph.join(" ")) + "</p>");
          paragraph = [];
        }

        function flushList() {
          if (!listType) return;
          html.push("</" + listType + ">");
          listType = "";
        }

        for (const line of lines) {
          if (line.startsWith(codeFence)) {
            if (inCode) {
              html.push("<pre><code>" + escapeHtml(codeLines.join("\\n")) + "</code></pre>");
              codeLines = [];
              inCode = false;
            } else {
              flushParagraph();
              flushList();
              inCode = true;
            }
            continue;
          }

          if (inCode) {
            codeLines.push(line);
            continue;
          }

          const trimmed = line.trim();
          if (!trimmed) {
            flushParagraph();
            flushList();
            continue;
          }

          if (trimmed.startsWith("### ")) {
            flushParagraph();
            flushList();
            html.push("<h3>" + renderInlineMarkdown(trimmed.slice(4)) + "</h3>");
            continue;
          }

          if (trimmed.startsWith("## ")) {
            flushParagraph();
            flushList();
            html.push("<h2>" + renderInlineMarkdown(trimmed.slice(3)) + "</h2>");
            continue;
          }

          if (trimmed.startsWith("# ")) {
            flushParagraph();
            flushList();
            html.push("<h1>" + renderInlineMarkdown(trimmed.slice(2)) + "</h1>");
            continue;
          }

          if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
            flushParagraph();
            if (listType !== "ul") {
              flushList();
              html.push("<ul>");
              listType = "ul";
            }
            html.push("<li>" + renderInlineMarkdown(trimmed.slice(2)) + "</li>");
            continue;
          }

          const orderedMatch = trimmed.match(/^\\d+\\.\\s+(.+)$/);
          if (orderedMatch) {
            flushParagraph();
            if (listType !== "ol") {
              flushList();
              html.push("<ol>");
              listType = "ol";
            }
            html.push("<li>" + renderInlineMarkdown(orderedMatch[1]) + "</li>");
            continue;
          }

          paragraph.push(trimmed);
        }

        if (inCode) {
          html.push("<pre><code>" + escapeHtml(codeLines.join("\\n")) + "</code></pre>");
        }
        flushParagraph();
        flushList();
        return html.join("") || '<p class="activity-detail">No report content yet.</p>';
      }

      function renderInlineMarkdown(value) {
        const codeTick = String.fromCharCode(96);
        const inlineCodePattern = new RegExp(codeTick + "([^" + codeTick + "]+)" + codeTick, "g");
        return escapeHtml(value)
          .replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
          .replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>")
          .replace(inlineCodePattern, "<code>$1</code>");
      }

      function escapeHtml(value) {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");
      }

      function escapeAttribute(value) {
        return escapeHtml(value).replaceAll("'", "&#39;");
      }
    </script>
  </body>
</html>`;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("request_body_too_large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function normalizeCity(value) {
  const city = String(value || defaultCity).trim().slice(0, 80);
  return city || defaultCity;
}

function normalizeIntent(value) {
  const intent = String(value || "forecast-summary").trim();
  const allowed = new Set([
    "forecast-summary",
    "travel-planning",
    "deploy-window",
    "snow-conditions",
    "weather-alert-explanation",
  ]);
  return allowed.has(intent) ? intent : "forecast-summary";
}

function normalizeBasePath(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed === "/") return "/";
  return trimmed.startsWith("/") ? trimmed.replace(/\/+$/, "") : `/${trimmed.replace(/\/+$/, "")}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
