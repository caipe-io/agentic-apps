import { requireAgenticSdlcReader } from "@/lib/agentic-sdlc/agentic-sdlc-auth";
import { withAgenticSdlcGate } from "@/lib/agentic-sdlc/guard";
import {
  platformRequest,
  reviewSetupAvailable,
  setupErrorResponse,
} from "@/lib/agentic-sdlc/platform-client";
async function handle(req: Request) {
  if (!(await requireAgenticSdlcReader(req)))
    return Response.json({ message: "Sign in required." }, { status: 401 });
  if (!reviewSetupAvailable())
    return Response.json({
      available: false,
      teams: [],
      message: "Autonomous review setup is not enabled for this environment.",
    });
  try {
    const [teams, models] = await Promise.all([
      platformRequest(req, "/api/dynamic-agents/teams"),
      platformRequest(req, "/api/dynamic-agents/models"),
    ]);
    // Also enforce the Autonomous entitlement before offering opt-in.
    await platformRequest(req, "/api/autonomous/tasks");
    const query = (new URL(req.url).searchParams.get("q") || "")
      .trim()
      .toLowerCase();
    const rows = Array.isArray(teams.data) ? teams.data : [];
    const allowed = rows.filter(
      (t: any) =>
        t.can_own_agents &&
        t.slug &&
        (!query || `${t.name} ${t.slug}`.toLowerCase().includes(query)),
    );
    const model = (models.data || []).find(
      (m: any) => m.model_id === process.env.AGENTIC_SDLC_REVIEW_MODEL_ID,
    );
    return Response.json({
      available: Boolean(model),
      model_name: model?.name || "Configured review model unavailable",
      teams: allowed
        .slice(0, 50)
        .map((t: any) => ({ name: t.name, slug: t.slug })),
      more_teams: allowed.length > 50,
    });
  } catch (error) {
    return setupErrorResponse(error);
  }
}
export const GET = withAgenticSdlcGate(handle);
