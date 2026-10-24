import { z } from "zod";

import { mcpJson } from "../../_lib/app-mcp-server.mjs";

export function registerLiteLlmMcpTools(server, { getDailyActivity, getModelInfo, getCostAnomalies }) {
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

  server.registerTool(
    "litellm_get_daily_activity",
    {
      title: "Get LiteLLM daily activity",
      description: "Return bounded daily LiteLLM spend, token, request, user, and model activity.",
      inputSchema: z.object({
        startDate: z.string().date(),
        endDate: z.string().date(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input) => mcpJson(await getDailyActivity(input)),
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
