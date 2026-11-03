import { withAgenticSdlcGate } from "@/lib/agentic-sdlc/guard";
import { prepareManualReview } from "@/lib/agentic-sdlc/manual-review";
import {
  SetupError,
  setupErrorResponse,
} from "@/lib/agentic-sdlc/platform-client";

type Context = {
  params: Promise<{ owner: string; repo: string; number: string }>;
};
export const POST = withAgenticSdlcGate(async (req: Request, ctx: Context) => {
  try {
    const { owner, repo, number } = await ctx.params;
    if (!/^[1-9]\d{0,8}$/.test(number))
      throw new SetupError("Invalid pull request.");
    return Response.json(
      await prepareManualReview(
        req,
        owner,
        repo,
        Number(number),
        await req.json(),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return setupErrorResponse(error);
  }
});
