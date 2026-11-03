import { withAgenticSdlcGate } from "@/lib/agentic-sdlc/guard";
import {
  manualReviewContext,
  requestManualReview,
} from "@/lib/agentic-sdlc/manual-review";
import {
  platformRequest,
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
      await requestManualReview(
        req,
        owner,
        repo,
        Number(number),
        await req.json(),
      ),
      { status: 202 },
    );
  } catch (error) {
    return setupErrorResponse(error);
  }
});

export const GET = withAgenticSdlcGate(async (req: Request, ctx: Context) => {
  try {
    const { owner, repo } = await ctx.params;
    const runId = new URL(req.url).searchParams.get("run_id");
    if (!runId || !/^[a-f0-9-]{36}$/i.test(runId))
      throw new SetupError("Invalid review run.");
    const { path } = await manualReviewContext(req, owner, repo);
    const runs = await platformRequest(req, `${path}/runs?limit=100`);
    const run = (Array.isArray(runs) ? runs : []).find(
      (value: { run_id: string }) => value.run_id === runId,
    );
    // Only return status; task prompts, credentials and private findings stay private.
    return Response.json(
      { run_id: runId, status: run?.status || "queued" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return setupErrorResponse(error);
  }
});
