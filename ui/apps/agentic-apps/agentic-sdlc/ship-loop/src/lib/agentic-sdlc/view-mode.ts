/** Runtime presentation choice. This never changes authorization or ingestion. */
export function isPrWorkspace() {
  return process.env.AGENTIC_SDLC_VIEW === "pull_requests";
}
