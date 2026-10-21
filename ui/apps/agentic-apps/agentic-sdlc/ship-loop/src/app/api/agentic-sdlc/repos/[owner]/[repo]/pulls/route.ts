import { withAgenticSdlcGate } from "@/lib/agentic-sdlc/guard";
import { getPrDashboard } from "@/lib/agentic-sdlc/pr-dashboard";
async function handle(
  req: Request,
  ctx: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await ctx.params;
  const value = new URL(req.url).searchParams.get("state") || "open";
  if (!["open", "closed", "all"].includes(value))
    return Response.json({ error: "invalid_state" }, { status: 400 });
  return Response.json(
    await getPrDashboard(req, owner, repo, value as "open" | "closed" | "all"),
  );
}
export const GET = withAgenticSdlcGate(handle);
