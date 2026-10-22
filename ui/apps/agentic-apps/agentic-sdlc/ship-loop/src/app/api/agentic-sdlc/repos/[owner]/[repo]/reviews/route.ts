import { withAgenticSdlcGate } from "@/lib/agentic-sdlc/guard";
import { configureRepositoryReviews } from "@/lib/agentic-sdlc/review-setup";
import {
  setupErrorResponse,
  SetupError,
} from "@/lib/agentic-sdlc/platform-client";
async function handle(
  req: Request,
  ctx: { params: Promise<{ owner: string; repo: string }> },
) {
  try {
    const body = await req.json();
    if (typeof body.enabled !== "boolean")
      throw new SetupError("Choose whether to enable reviews.");
    const { owner, repo } = await ctx.params;
    return Response.json(
      await configureRepositoryReviews(
        req,
        owner,
        repo,
        body.enabled,
        typeof body.team_slug === "string" ? body.team_slug : "",
      ),
    );
  } catch (error) {
    return setupErrorResponse(error);
  }
}
export const PUT = withAgenticSdlcGate(handle);
