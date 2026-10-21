import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { Octokit } from "@octokit/rest";
import {
  getGitHubAccessToken,
  requireAgenticSdlcReader,
} from "@/lib/agentic-sdlc/agentic-sdlc-auth";
export const runtime = "nodejs";
export async function POST(req: Request) {
  if (!(await requireAgenticSdlcReader(req)))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const server = new McpServer({ name: "agentic-sdlc-app", version: "0.1.0" });
  server.registerTool(
    "sdlc_get_runtime_contract",
    { inputSchema: z.object({}), annotations: { readOnlyHint: true } },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            appId: "agentic-sdlc",
            runtime: "ship-loop",
            capabilities: [
              "repository-snapshot",
              "pr-review-dashboard",
              "durable-webhook-projection",
            ],
            mutations:
              "No code, merge, deployment or review mutations are exposed by MCP.",
          }),
        },
      ],
    }),
  );
  server.registerTool(
    "sdlc_get_repository_snapshot",
    {
      inputSchema: z.object({
        repo: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ repo }) => {
      const [owner, name] = repo.split("/");
      const token = await getGitHubAccessToken(req);
      const client = new Octokit({
        auth: token,
        baseUrl: process.env.AGENTIC_SDLC_GITHUB_API_URL,
        request: { timeout: 10000 },
      });
      const [metadata, issues, pulls, runs] = await Promise.all([
        client.repos.get({ owner, repo: name }),
        client.issues.listForRepo({
          owner,
          repo: name,
          state: "open",
          per_page: 20,
        }),
        client.pulls.list({ owner, repo: name, state: "open", per_page: 20 }),
        client.actions.listWorkflowRunsForRepo({
          owner,
          repo: name,
          per_page: 20,
        }),
      ]);
      const data = {
        repository: metadata.data.full_name,
        generatedAt: new Date().toISOString(),
        openIssues: issues.data
          .filter((i) => !i.pull_request)
          .map((i) => ({ number: i.number, title: i.title, url: i.html_url })),
        openPullRequests: pulls.data.map((p) => ({
          number: p.number,
          title: p.title,
          draft: p.draft,
          head_sha: p.head.sha,
          url: p.html_url,
        })),
        workflowRuns: runs.data.workflow_runs.map((r) => ({
          name: r.name,
          status: r.status,
          conclusion: r.conclusion,
          url: r.html_url,
        })),
        limits: { issues: 20, pulls: 20, runs: 20 },
      };
      return {
        content: [{ type: "text", text: JSON.stringify(data) }],
        structuredContent: data,
      };
    },
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return await transport.handleRequest(req);
}
