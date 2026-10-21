import { Octokit } from "@octokit/rest";
import { getGitHubAccessToken } from "./agentic-sdlc-auth";

export type PrDashboardItem = {
  number: number;
  title: string;
  url: string;
  author: string;
  labels: string[];
  requested_reviewers: string[];
  reviewed_by: string[];
  agent_review: {
    status:
      | "no_findings"
      | "findings"
      | "incomplete"
      | "reviewed"
      | "stale"
      | "not_reviewed"
      | "unverified"
      | "unknown";
    url: string | null;
  };
  state: string;
  draft: boolean;
  head_sha: string;
  updated_at: string;
  ci: {
    status: string;
    checks: Array<{
      name: string;
      status: string;
      conclusion: string | null;
      url: string | null;
    }>;
  };
  review_status: string;
  reviews: Array<{
    author: string;
    state: string;
    head_sha: string;
    current_head: boolean;
    url: string;
    task_id: string | null;
    body: string;
    body_truncated: boolean;
    submitted_at: string | null;
  }>;
  comments: Array<{
    id: number;
    author: string;
    body: string;
    path: string;
    line: number | null;
    outdated: boolean;
    url: string;
  }>;
  missing_signals: string[];
};
export async function getPrDashboard(
  req: Request,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open",
) {
  const token = await getGitHubAccessToken(req);
  const client = new Octokit({
    auth: token,
    baseUrl: process.env.AGENTIC_SDLC_GITHUB_API_URL,
    request: { timeout: 10000 },
  });
  // Identity comes from the caller's connected GitHub token, never browser input.
  const viewer = await client.users.getAuthenticated().then(
    ({ data }) => data.login,
    () => null,
  );
  const trustedReviewers = new Set(
    (process.env.AGENTIC_SDLC_REVIEWER_LOGINS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const trustedTasks = new Set(
    (process.env.AGENTIC_SDLC_REVIEW_TASK_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const { data: pulls } = await client.pulls.list({
    owner,
    repo,
    state,
    sort: "updated",
    direction: "desc",
    per_page: 20,
  });
  const items: PrDashboardItem[] = [];
  for (let offset = 0; offset < pulls.length; offset += 3) {
    items.push(
      ...(await Promise.all(
        pulls.slice(offset, offset + 3).map(async (pr) => {
          const [reviewResult, checkResult, statusResult, commentResult] =
            await Promise.allSettled([
              client.pulls.listReviews({
                owner,
                repo,
                pull_number: pr.number,
                per_page: 100,
              }),
              client.checks.listForRef({
                owner,
                repo,
                ref: pr.head.sha,
                per_page: 100,
                filter: "latest",
              }),
              client.repos.getCombinedStatusForRef({
                owner,
                repo,
                ref: pr.head.sha,
                per_page: 100,
              }),
              client.pulls.listReviewComments({
                owner,
                repo,
                pull_number: pr.number,
                sort: "created",
                direction: "desc",
                per_page: 30,
              }),
            ]);
          const missing: string[] = [];
          if (reviewResult.status === "rejected") missing.push("reviews");
          if (checkResult.status === "rejected") missing.push("checks");
          if (statusResult.status === "rejected")
            missing.push("commit statuses");
          if (commentResult.status === "rejected")
            missing.push("inline comments");
          const reviews =
            reviewResult.status === "fulfilled" ? reviewResult.value.data : [];
          const checks =
            checkResult.status === "fulfilled"
              ? checkResult.value.data.check_runs
              : [];
          const statuses =
            statusResult.status === "fulfilled"
              ? statusResult.value.data.statuses
              : [];
          const comments =
            commentResult.status === "fulfilled"
              ? commentResult.value.data
              : [];
          const taskMarker = (r: (typeof reviews)[number]) => {
            const match = (r.body || "").match(
              /<!-- caipe-pr-review:task=([a-zA-Z0-9_-]+);head=([a-f0-9]{40}) -->/,
            );
            return match && match[2] === r.commit_id ? match : null;
          };
          const isTrustedAgent = (r: (typeof reviews)[number]) => {
            const marker = taskMarker(r);
            return Boolean(
              marker &&
                trustedReviewers.has((r.user?.login || "").toLowerCase()) &&
                trustedTasks.has(marker[1]),
            );
          };
          // Keep human decisions distinct from COMMENT-only agent reports and
          // from approvals on an older head. A dismissed decision revokes it.
          const latestByReviewer = new Map<string, string>();
          for (const r of reviews)
            if (
              r.user?.login &&
              !taskMarker(r) &&
              r.state !== "PENDING" &&
              r.state !== "COMMENTED"
            )
              latestByReviewer.set(
                r.user.login,
                r.commit_id === pr.head.sha ? r.state : "STALE",
              );
          const decisions = [...latestByReviewer.values()];
          const reviewStatus =
            reviewResult.status === "rejected"
              ? "unknown"
              : decisions.includes("CHANGES_REQUESTED")
                ? "changes requested"
                : decisions.includes("APPROVED")
                  ? "approved review present"
                  : reviews.some(
                        (r) =>
                          !taskMarker(r) &&
                          r.commit_id === pr.head.sha &&
                          r.state === "COMMENTED",
                      )
                    ? "commented on current head"
                    : "awaiting review";
          const submittedAgentReviews = reviews.filter(
            (r) =>
              taskMarker(r) && r.state !== "PENDING" && r.state !== "DISMISSED",
          );
          const trustedAgentReviews =
            submittedAgentReviews.filter(isTrustedAgent);
          const latestAgent = trustedAgentReviews
            .filter((r) => r.commit_id === pr.head.sha)
            .at(-1);
          let agentStatus: PrDashboardItem["agent_review"]["status"] =
            reviewResult.status === "rejected"
              ? "unknown"
              : latestAgent
                ? "reviewed"
                : trustedAgentReviews.length
                  ? "stale"
                  : submittedAgentReviews.length
                    ? "unverified"
                    : "not_reviewed";
          if (latestAgent) {
            const marker = taskMarker(latestAgent)!;
            const verdicts = [
              ...(latestAgent.body || "").matchAll(
                /<!-- caipe-pr-verdict:v1;task=([a-zA-Z0-9_-]+);head=([a-f0-9]{40});result=(no_findings|findings|incomplete) -->/g,
              ),
            ];
            // Never infer clearance from prose, review presence, or a green CI.
            if (
              verdicts.length === 1 &&
              verdicts[0][1] === marker[1] &&
              verdicts[0][2] === pr.head.sha
            )
              agentStatus = verdicts[0][3] as
                | "no_findings"
                | "findings"
                | "incomplete";
          }
          let ciStatus =
            checkResult.status === "rejected"
              ? "unknown"
              : checks.length === 0
                ? "no checks"
                : checks.some((c) =>
                      [
                        "failure",
                        "cancelled",
                        "timed_out",
                        "action_required",
                        "startup_failure",
                        "stale",
                      ].includes(c.conclusion || ""),
                    )
                  ? "failing"
                  : checks.some((c) => c.status !== "completed")
                    ? "pending"
                    : "passing";
          if (
            statuses.some((s) => s.state === "failure" || s.state === "error")
          )
            ciStatus = "failing";
          else if (
            statuses.some((s) => s.state === "pending") &&
            ciStatus !== "failing"
          )
            ciStatus = "pending";
          else if (ciStatus === "no checks" && statuses.length)
            ciStatus = "passing";
          if (missing.includes("commit statuses") && ciStatus === "passing")
            ciStatus = "incomplete";
          if (
            checkResult.status === "fulfilled" &&
            checkResult.value.data.total_count > 100
          ) {
            missing.push("additional checks exceed page limit");
            if (ciStatus === "passing") ciStatus = "incomplete";
          }
          if (reviews.length === 100) missing.push("reviews exceed page limit");
          if (comments.length === 30)
            missing.push("inline comments may exceed page limit");
          return {
            number: pr.number,
            title: pr.title,
            url: pr.html_url,
            author: pr.user?.login || "unknown",
            labels: pr.labels
              .map((label) => label.name)
              .filter((name): name is string => Boolean(name)),
            requested_reviewers: (pr.requested_reviewers ?? []).map(
              (user) => user.login,
            ),
            reviewed_by: [
              ...new Set(
                reviews
                  .filter((r) => r.state !== "PENDING" && !taskMarker(r))
                  .map((r) => r.user?.login)
                  .filter((login): login is string => Boolean(login)),
              ),
            ],
            agent_review: {
              status: agentStatus,
              url:
                (latestAgent || trustedAgentReviews.at(-1))?.html_url || null,
            },
            state: pr.merged_at ? "merged" : pr.state,
            draft: Boolean(pr.draft),
            head_sha: pr.head.sha,
            updated_at: pr.updated_at,
            ci: {
              status: ciStatus,
              checks: checks
                .map<{
                  name: string;
                  status: string;
                  conclusion: string | null;
                  url: string | null;
                }>((c) => ({
                  name: c.name,
                  status: c.status,
                  conclusion: c.conclusion,
                  url: c.html_url,
                }))
                .concat(
                  statuses.map((s) => ({
                    name: s.context,
                    status: s.state === "pending" ? "in_progress" : "completed",
                    conclusion: s.state === "pending" ? null : s.state,
                    url: s.target_url,
                  })),
                ),
            },
            review_status: reviewStatus,
            reviews: reviews
              .filter((r) => r.state !== "PENDING")
              .map((r) => {
                const marker = taskMarker(r);
                return {
                  author: r.user?.login || "unknown",
                  state: r.state,
                  head_sha: r.commit_id || "",
                  current_head: r.commit_id === pr.head.sha,
                  url: r.html_url,
                  task_id: marker?.[1] || null,
                  body: (r.body || "")
                    .replace(
                      /<!-- caipe-pr-(?:review:task=[a-zA-Z0-9_-]+;head=[a-f0-9]{40}|verdict:v1;task=[a-zA-Z0-9_-]+;head=[a-f0-9]{40};result=(?:no_findings|findings|incomplete)) -->/g,
                      "",
                    )
                    .trim()
                    .slice(0, 6000),
                  body_truncated: (r.body || "").length > 6000,
                  submitted_at: r.submitted_at || null,
                };
              }),
            comments: comments.map((c) => ({
              id: c.id,
              author: c.user?.login || "unknown",
              body: c.body.slice(0, 3000),
              path: c.path,
              line: c.line ?? null,
              outdated: c.line === null,
              url: c.html_url,
            })),
            missing_signals: missing,
          } satisfies PrDashboardItem;
        }),
      )),
    );
  }
  return {
    repository: `${owner}/${repo}`,
    generated_at: new Date().toISOString(),
    viewer_login: viewer,
    items,
    limits: {
      pull_requests: 20,
      reviews_per_pr: 100,
      checks_per_head: 100,
      inline_comments_per_pr: 30,
    },
    note: "Human review signals and agent-reported verdicts are advisory, not merge permission or compliance certification. Approvals shown are for the current head. Inline comments may include resolved threads. Newest 20 matching pull requests are shown.",
  };
}
