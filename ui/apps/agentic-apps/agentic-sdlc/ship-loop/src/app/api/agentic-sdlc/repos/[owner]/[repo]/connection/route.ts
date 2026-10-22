import { withAgenticSdlcGate } from "@/lib/agentic-sdlc/guard";
import { repositoryContext } from "@/lib/agentic-sdlc/review-setup";
import {
  managedReviewTask,
  reviewSetupAvailable,
  setupErrorResponse,
} from "@/lib/agentic-sdlc/platform-client";
import {
  publicBinding,
  reviewBindings,
} from "@/lib/agentic-sdlc/review-bindings";
async function handle(
  req: Request,
  ctx: { params: Promise<{ owner: string; repo: string }> },
) {
  try {
    const { owner, repo } = await ctx.params;
    const { reader, meta, registered } = await repositoryContext(
      req,
      owner,
      repo,
    );
    const binding = await (
      await reviewBindings()
    ).findOne({ repo_id: String(meta.id) });
    const managed = managedReviewTask(meta.full_name);
    const received = registered.webhook_last_received_at;
    const checked = registered.connection_check_started_at;
    return Response.json({
      full_name: meta.full_name,
      registered: true,
      can_administer: Boolean(meta.permissions?.admin),
      webhook_url: process.env.AGENTIC_SDLC_GITHUB_WEBHOOK_URL || null,
      delivery_verified: Boolean(received && (!checked || received >= checked)),
      last_received_at: received || null,
      reviews_available: reviewSetupAvailable(),
      reviews: managed
        ? { state: "managed", task_id: managed, can_manage: false }
        : publicBinding(binding, reader.user.id),
    });
  } catch (error) {
    return setupErrorResponse(error);
  }
}
export const GET = withAgenticSdlcGate(handle);
