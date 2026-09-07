import { z } from "zod";

import { mcpJson } from "../../_lib/app-mcp-server.mjs";

export function registerFinOpsMcpTools(server, { getCapabilities }) {
  server.registerTool(
    "finops_get_capabilities",
    {
      title: "Get FinOps data-source capabilities",
      description:
        "Return the configured FinOps data sources, supported reporting windows, and exact agent/runtime readiness.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => mcpJson(getCapabilities()),
  );

}
