export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    !process.env.AGENTIC_SDLC_MONGODB_URI
  )
    return;
  const { recoverDeferredAgenticSdlcEvents } = await import(
    "./lib/agentic-sdlc/async-worker"
  );
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
  const tick = () =>
    void recoverDeferredAgenticSdlcEvents().catch(() =>
      console.error("SDLC projection recovery could not access storage"),
    );
  tick();
  setInterval(tick, 15000).unref();
}
