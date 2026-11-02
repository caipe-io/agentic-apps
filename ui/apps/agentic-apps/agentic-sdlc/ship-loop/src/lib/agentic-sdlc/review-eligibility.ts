export const REVIEW_ACTIONS = [
  "opened",
  "synchronize",
  "ready_for_review",
] as const;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Only normal, open PRs with a verified head are review candidates. */
export function eligibleReviewEvent(
  event: unknown,
  action: unknown,
  payload: unknown,
): boolean {
  if (
    event !== "pull_request" ||
    !REVIEW_ACTIONS.some((candidate) => candidate === action)
  )
    return false;
  const pr = record(record(payload)?.pull_request);
  const head = record(pr?.head);
  return (
    pr?.state === "open" &&
    pr.draft === false &&
    pr.merged !== true &&
    typeof head?.sha === "string" &&
    /^[a-f0-9]{40}$/.test(head.sha)
  );
}

export function reviewTriggerFilter(fullName: string) {
  return {
    conditions: [
      { source: "payload", field: "repository.full_name", values: [fullName] },
      { source: "header", field: "X-GitHub-Event", values: ["pull_request"] },
      { source: "payload", field: "action", values: [...REVIEW_ACTIONS] },
      // Native webhook filters compare scalar booleans through JSON encoding.
      { source: "payload", field: "pull_request.draft", values: ["false"] },
      { source: "payload", field: "pull_request.state", values: ["open"] },
    ],
  };
}
