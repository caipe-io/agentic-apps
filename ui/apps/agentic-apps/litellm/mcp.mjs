import { z } from "zod";

import { mcpJson } from "../../_lib/app-mcp-server.mjs";

export function registerLiteLlmMcpTools(server, { getDailyActivity, getModelInfo, getCostAnomalies, getAnomalyContributors }) {
  if (getCostAnomalies) server.registerTool(
    "litellm_get_cost_anomalies",
    {
      title: "Investigate LiteLLM cost anomalies",
      description: "Return reproducible model spend candidates and token/request/cache comparisons against a four-week weekday baseline. Includes coverage, thresholds, source snapshot ID, and daily evidence. A candidate is not a proven cause.",
      inputSchema: z.object({
        days: z.union([z.literal(1), z.literal(3), z.literal(4), z.literal(7), z.literal(14)]).default(7),
        minImpactUsd: z.number().min(0).max(1_000_000).default(25),
        minIncreasePercent: z.number().min(0).max(10_000).default(50),
        endDate: z.string().date().optional().describe("Last completed UTC date of the requested analysis; preserve the dashboard's date window."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input) => mcpJson(await getCostAnomalies(input)),
  );

  if (getAnomalyContributors) server.registerTool(
    "litellm_get_anomaly_contributors",
    {
      title: "Identify model spike contributors",
      description: "Attribute one candidate model's added spend to its top ten virtual keys and credential owners. Reconciles model-filtered key activity against the exact anomaly snapshot, using the same four-week weekday baseline. Returns expected/actual spend, positive increases and offsets. Never returns key credentials; unknown ownership stays unknown. Usage attribution is not proof of a root cause.",
      inputSchema: z.object({
        model: z.string().min(1).max(500),
        snapshotId: z.string().regex(/^[a-f0-9]{32}$/),
        days: z.union([z.literal(1), z.literal(3), z.literal(4), z.literal(7), z.literal(14)]).default(7),
        minImpactUsd: z.number().min(0).max(1_000_000).default(25),
        minIncreasePercent: z.number().min(0).max(10_000).default(50),
        endDate: z.string().date(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input) => mcpJson(await getAnomalyContributors(input)),
  );

  server.registerTool(
    "litellm_get_daily_activity",
    {
      title: "Get LiteLLM daily activity",
      description: "Return compact daily gateway totals for at most 42 days. Pass model to inspect one model instead. Excludes user/key breakdowns and credentials. Missing model activity stays unknown.",
      inputSchema: z.object({
        startDate: z.string().date(),
        endDate: z.string().date(),
        model: z.string().min(1).max(500).optional().describe("Exact model name for per-model daily evidence; omit for gateway totals."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input) => {
      const days = (Date.parse(input.endDate + "T00:00:00Z") - Date.parse(input.startDate + "T00:00:00Z")) / 86_400_000 + 1;
      if (!Number.isInteger(days) || days < 1 || days > 42) throw new Error("Daily activity requires a date range of 1 to 42 days.");
      const response = await getDailyActivity(input);
      if (!Array.isArray(response?.results) || response.results.length > days || response.metadata?.has_more || Number(response.metadata?.total_pages) > 1) throw new Error("Incomplete daily activity response.");
      return mcpJson({
        source: "litellm-daily-activity", scope: input.model ? "model" : "gateway", model: input.model ?? null,
        startDate: input.startDate, endDate: input.endDate,
        results: response.results.map((day) => {
          const date = day.date ?? day.start_date ?? day.day;
          if (typeof date !== "string" || date < input.startDate || date > input.endDate) throw new Error("Unexpected activity date.");
          const row = input.model ? (day.breakdown?.models ?? day.models)?.[input.model] : day;
          return { date, metrics: row ? compactActivityMetrics(row.metrics ?? row) : null };
        }),
        note: "Only daily metrics are returned. Null model activity is not evidence of zero usage. Cache tokens may overlap input tokens.",
      });
    },
  );

  server.registerTool(
    "litellm_get_model_info",
    {
      title: "Get LiteLLM model inventory",
      description: "Return the configured LiteLLM models and their safe operational metadata.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => mcpJson(await getModelInfo()),
  );
}

// Keep reporting MCP responses below gateway buffers and exclude unrelated key/user data.
function compactActivityMetrics(value) {
  const fields = ["spend", "total_spend", "cost", "prompt_tokens", "total_prompt_tokens", "completion_tokens", "total_completion_tokens", "total_tokens", "tokens", "api_requests", "requests", "request_count", "successful_requests", "cache_read_input_tokens", "total_cache_read_input_tokens", "cache_creation_input_tokens", "total_cache_creation_input_tokens"];
  return Object.fromEntries(fields.filter((field) => value[field] !== null && value[field] !== undefined && value[field] !== "" && Number.isFinite(Number(value[field]))).map((field) => [field, Number(value[field])]));
}
