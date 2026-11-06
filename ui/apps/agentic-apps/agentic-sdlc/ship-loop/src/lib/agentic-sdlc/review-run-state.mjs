/** @typedef {{state: "queued"|"running"|"completed"|"incomplete"|"skipped"|"failed"|"unknown", completed?: number, total?: number, reason?: string, resumable: boolean}} ReviewRunState */

/** @param {any} run @param {string} task @param {string} head @returns {ReviewRunState} */
// Read execution state separately from the model's advisory verdict. A successful
// transport with no head-bound verdict never establishes a completed review.
export function reviewRunState(run, task, head) {
  if (!run) return { state: "queued", resumable: false };
  if (["pending", "running"].includes(run.status)) {
    const execution = run.review_execution;
    const counts = execution?.head === head && Number.isInteger(execution.completed) &&
      Number.isInteger(execution.total) && execution.completed >= 0 && execution.total >= execution.completed
      ? { completed: execution.completed, total: execution.total } : {};
    return { state: "running", ...counts, resumable: false };
  }
  const execution = run.review_execution;
  if (execution?.version === 1 && execution.head === head &&
    ["completed", "incomplete", "skipped"].includes(execution.state) &&
    (execution.state !== "completed" || run.status === "success")) {
    return { state: execution.state, completed: execution.completed, total: execution.total,
      reason: typeof execution.reason === "string" ? execution.reason : undefined,
      resumable: run.status === "failed" && execution.state === "incomplete" && execution.resumable === true };
  }
  if (run.status === "failed") return { state: "failed", reason: run.error || "Review execution failed", resumable: false };
  if (run.status === "skipped") return { state: "skipped", resumable: false };
  const body = run.response_full || run.response_preview || "";
  const markers = [...body.matchAll(/<!-- caipe-pr-verdict:v1;task=([a-zA-Z0-9_-]+);head=([a-f0-9]{40});result=(findings|no_findings|incomplete|skipped) -->/g)];
  if (markers.length !== 1 || markers[0][1] !== task || markers[0][2] !== head)
    return { state: "unknown", reason: "Run ended without a verified current-head review outcome", resumable: false };
  const result = markers[0][3];
  return { state: result === "incomplete" || result === "skipped" ? result : "completed", resumable: false };
}

/** @type {Record<ReviewRunState["state"], {icon: string, label: string, tone: string}>} */
export const reviewStatePresentation = {
  queued: { icon: "⏳", label: "Review queued", tone: "review-status-info" },
  running: { icon: "🔎", label: "Reviewing", tone: "review-status-info" },
  completed: { icon: "✅", label: "Review completed", tone: "review-status-success" },
  incomplete: { icon: "⚠️", label: "Review incomplete", tone: "review-status-warning" },
  skipped: { icon: "⏭️", label: "Review skipped", tone: "review-status-info" },
  failed: { icon: "❌", label: "Review failed", tone: "review-status-error" },
  unknown: { icon: "❔", label: "Review outcome unavailable", tone: "review-status-warning" },
};
