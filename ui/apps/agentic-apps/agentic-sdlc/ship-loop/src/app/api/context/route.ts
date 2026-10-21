export async function GET() {
  return Response.json({
    version: "1.0",
    appId: "agentic-sdlc",
    route: "/apps/agentic-sdlc",
    title: "Agentic SDLC",
    agentId: process.env.AGENTIC_SDLC_AGENT_ID || "agent-agentic-sdlc",
    mcpServerId: "agentic_sdlc",
    domainAnswersRequireMcp: true,
  });
}
