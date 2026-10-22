export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    !process.env.AGENTIC_SDLC_MONGODB_URI
  )
    return;
  const { recoverDeferredAgenticSdlcEvents } =
    await import("./lib/agentic-sdlc/async-worker");
  const { recoverReviewDispatches } =
    await import("./lib/agentic-sdlc/review-dispatch");
  const { reviewBindings } = await import("./lib/agentic-sdlc/review-bindings");
  const { getCollection } = await import("./lib/mongodb");
  const { AGENTIC_SDLC_COLLECTIONS } = await import("./types/agentic-sdlc");
  const initialize = async () => {
    await (
      await getCollection(AGENTIC_SDLC_COLLECTIONS.REPOS)
    ).createIndex({ repo_id: 1 }, { unique: true });
    await (
      await getCollection(AGENTIC_SDLC_COLLECTIONS.ARTIFACTS)
    ).createIndex({ repo_id: 1, kind: 1, artifact_id: 1 }, { unique: true });
    await (
      await getCollection(AGENTIC_SDLC_COLLECTIONS.EVENTS)
    ).createIndex(
      { github_delivery_id: 1 },
      {
        unique: true,
        partialFilterExpression: { github_delivery_id: { $type: "string" } },
      },
    );
  };
  await initialize();
  await (await reviewBindings()).createIndex({ repo_id: 1 }, { unique: true });
  await (
    await getCollection(AGENTIC_SDLC_COLLECTIONS.EVENTS)
  ).createIndex({
    "review_dispatch.state": 1,
    "review_dispatch.next_attempt_at": 1,
  });
  const tick = () =>
    void recoverDeferredAgenticSdlcEvents().catch(() =>
      console.error("SDLC projection recovery could not access storage"),
    );
  const reviewTick = () =>
    void recoverReviewDispatches().catch(() =>
      console.error("SDLC review dispatch recovery could not access storage"),
    );
  reviewTick();
  setInterval(reviewTick, 15000).unref();
  tick();
  setInterval(tick, 15000).unref();
}
