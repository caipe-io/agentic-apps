import { reviewRunState } from "./review-run-state.mjs";
export type PreparedReview = {
  task_id: string;
  agent_id: string;
  owner_sub: string;
  binding_key: string;
  run_body: { request_id: string; context: Record<string, unknown> };
};

type Fetch = typeof fetch;
async function hostRequest(
  path: string,
  signal: AbortSignal,
  body?: unknown,
  request: Fetch = fetch,
) {
  const response = await request(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? "Your Grid session needs Autonomous access and ownership of this reviewer task, or administrator access."
        : value.message ||
          value.detail ||
          "The review service could not complete this request.",
    );
  return value;
}
function taskPath(taskId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(taskId))
    throw new Error("Invalid reviewer task.");
  return `/api/autonomous/tasks/${encodeURIComponent(taskId)}`;
}
export async function startPreparedReview(
  prepared: PreparedReview,
  signal: AbortSignal,
  request: Fetch = fetch,
) {
  const path = taskPath(prepared.task_id);
  // Deliberately use host session cookies, never a delegated app bearer or bot identity.
  // The host still enforces Autonomous entitlement and task owner/admin access.
  const task = await hostRequest(path, signal, undefined, request);
  if (
    !task.enabled ||
    task.dynamic_agent_id !== prepared.agent_id ||
    task.owner_sub !== prepared.owner_sub ||
    !task.description?.includes(`[sdlc-binding:${prepared.binding_key}]`)
  )
    throw new Error(
      "The configured reviewer is disabled or its scope changed.",
    );
  const scoped = task.metadata?.review_execution_version === 1;
  if (!scoped && task.manual_run_context_version !== 1)
    throw new Error(
      "Re-review is not available on this deployment yet. The review service needs an update.",
    );
  if (!task.prompt?.includes("<!-- caipe-pr-manual-review-policy:v1 -->"))
    throw new Error(
      "This saved reviewer needs an update before it can re-review existing commits.",
    );
  const result = await hostRequest(
    scoped ? `${path}/reviews/run` : `${path}/run`,
    signal,
    scoped ? {
      request_id: prepared.run_body.request_id,
      repository: (prepared.run_body.context.repository as any)?.full_name,
      pull_request_number: (prepared.run_body.context.pull_request as any)?.number,
      head_sha: (prepared.run_body.context.pull_request as any)?.head?.sha,
    } : prepared.run_body,
    request,
  );
  if (!/^[a-f0-9-]{36}$/i.test(result?.run_id || ""))
    throw new Error("No review run was returned. Retry with the same request.");
  return { taskId: prepared.task_id, runId: result.run_id as string };
}
export async function reviewRunStatus(
  taskId: string,
  runId: string,
  signal: AbortSignal,
  request: Fetch = fetch,
) {
  const runs = await hostRequest(
    `${taskPath(taskId)}/runs?limit=100`,
    signal,
    undefined,
    request,
  );
  if (!Array.isArray(runs)) throw new Error("Invalid review run history.");
  return (
    runs.find((run: { run_id: string }) => run.run_id === runId)?.status ||
    "queued"
  );
}

export async function reviewRunProgress(
  taskId: string, runId: string, head: string, signal: AbortSignal, request: Fetch = fetch,
) {
  const runs = await hostRequest(`${taskPath(taskId)}/runs?limit=100`, signal, undefined, request);
  if (!Array.isArray(runs)) throw new Error("Invalid review run history.");
  return reviewRunState(runs.find((run: any) => run.run_id === runId), taskId, head);
}

export async function resumeReviewRun(taskId: string, runId: string, signal: AbortSignal, request: Fetch = fetch) {
  if (!/^[a-f0-9-]{36}$/i.test(runId)) throw new Error("Invalid review run.");
  const result = await hostRequest(`${taskPath(taskId)}/runs/${runId}/resume-review`, signal, {}, request);
  if (!/^[a-f0-9-]{36}$/i.test(result?.run_id || "")) throw new Error("No resumed run was returned.");
  return { taskId, runId: result.run_id as string };
}

export async function reviewTaskProgress(taskId: string, signal: AbortSignal, request: Fetch = fetch) {
  const rows = await hostRequest(`${taskPath(taskId)}/review-status`, signal, undefined, request);
  if (!Array.isArray(rows)) throw new Error("Invalid review status response.");
  return rows;
}
