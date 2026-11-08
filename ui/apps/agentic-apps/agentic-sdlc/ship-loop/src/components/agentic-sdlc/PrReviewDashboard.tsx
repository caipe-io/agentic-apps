"use client";

import { useEffect, useId, useState } from "react";
import { CheckCircle2, ChevronDown, Circle, Clock3, GitPullRequest, HelpCircle, Loader2, MessageSquare, RotateCw, Search, Tag, TriangleAlert, XCircle, type LucideIcon } from "lucide-react";
import type { PrDashboardItem } from "@/lib/agentic-sdlc/pr-dashboard";

import { reviewTaskProgress } from "@/lib/agentic-sdlc/manual-review-client";
import { reviewRunState, reviewStatePresentation, type ReviewRunState } from "@/lib/agentic-sdlc/review-run-state.mjs";
import { ReviewBody } from "./ReviewBody";
import { ReReviewButton } from "./ReReviewButton";
import { ReviewSkills, FindingSkills } from "./ReviewSkills";

type Snapshot = {
  generated_at: string;
  viewer_login: string | null;
  review_task_id?: string | null;
  items: PrDashboardItem[];
  note: string;
};

const agentLabels: Record<PrDashboardItem["agent_review"]["status"], string> = {
  no_findings: "No findings (current head)",
  findings: "Findings raised (current head)",
  incomplete: "Incomplete review",
  reviewed: "Reviewed · no verdict",
  stale: "Needs rerun · new commits",
  not_reviewed: "Not reviewed",
  unverified: "Unverified attribution",
  unknown: "Unavailable",
};

const agentPresentation: Record<
  PrDashboardItem["agent_review"]["status"],
  { icon: LucideIcon; tone: string }
> = {
  no_findings: { icon: CheckCircle2, tone: "review-status-success" },
  findings: { icon: MessageSquare, tone: "review-status-warning" },
  incomplete: { icon: TriangleAlert, tone: "review-status-warning" },
  reviewed: { icon: Circle, tone: "review-status-info" },
  stale: { icon: RotateCw, tone: "border-border text-muted-foreground" },
  not_reviewed: { icon: Clock3, tone: "border-border text-muted-foreground" },
  unverified: { icon: TriangleAlert, tone: "review-status-warning" },
  unknown: { icon: HelpCircle, tone: "border-border text-muted-foreground" },
};

export function PrReviewDashboard({
  owner,
  repo,
  revision = 0,
}: {
  owner: string;
  repo: string;
  revision?: number;
}) {
  const [state, setState] = useState("open");
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState("");
  const [checks, setChecks] = useState("");
  const [review, setReview] = useState("");
  const [scope, setScope] = useState("");
  const [agent, setAgent] = useState("");
  const [authorHandle, setAuthorHandle] = useState("");
  const [reviewerHandle, setReviewerHandle] = useState("");
  const [reviewerRole, setReviewerRole] = useState("either");
  const handlesId = useId();
  const requestKey = JSON.stringify([owner, repo, state]);
  // Retain one successful snapshot for this mounted dashboard, never a shared
  // browser/server cache. A different repository or PR state cannot display it.
  const [snapshot, setSnapshot] = useState<{
    key: string;
    data: Snapshot;
  } | null>(null);
  const [request, setRequest] = useState({
    key: requestKey,
    loading: true,
    error: "",
  });
  const data = snapshot?.key === requestKey ? snapshot.data : null;
  const loading = request.key !== requestKey || request.loading;
  const error = request.key === requestKey ? request.error : "";
  const [tick, setTick] = useState(0);
  const [executions, setExecutions] = useState<{key: string; rows: any[]}>({key:"", rows:[]});
  useEffect(() => {
    const task = data?.review_task_id;
    if (!task) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const rows = await reviewTaskProgress(task!, controller.signal);
        if (controller.signal.aborted) return;
        setExecutions({key: requestKey, rows});
        timer = setTimeout(poll, 10000);
      } catch { /* Private task progress may be unavailable to this viewer; GitHub evidence remains visible. */ }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [data?.review_task_id, requestKey, revision]);
  useEffect(() => {
    setLabel("");
    setChecks("");
    setReview("");
    setScope("");
    setAgent("");
    setQuery("");
    setAuthorHandle("");
    setReviewerHandle("");
    setReviewerRole("either");
  }, [owner, repo]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = (event: Event) => {
      const value = (event as CustomEvent).detail;
      if (value?.owner !== owner || value?.repo !== repo) return;
      clearTimeout(timer);
      timer = setTimeout(() => setTick((current) => current + 1), 3000);
    };
    window.addEventListener("agentic-sdlc:repo-synced", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("agentic-sdlc:repo-synced", refresh);
    };
  }, [owner, repo]);
  useEffect(() => {
    const stop = new AbortController();
    setRequest({ key: requestKey, loading: true, error: "" });
    fetch(
      `/apps/agentic-sdlc/api/agentic-sdlc/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=${state}`,
      {
        signal: stop.signal,
        cache: "no-store",
      },
    )
      .then(async (response) => {
        // Access loss invalidates the saved view; transient failures retain it.
        if ([401, 403, 404].includes(response.status) && !stop.signal.aborted)
          setSnapshot(null);
        const value = await response.json();
        if (!response.ok)
          throw new Error(value.message || "Could not read pull requests");
        return value;
      })
      .then((value: Snapshot) => {
        if (stop.signal.aborted) return;
        setSnapshot({ key: requestKey, data: value });
        setRequest({ key: requestKey, loading: false, error: "" });
      })
      .catch((cause: unknown) => {
        if (!stop.signal.aborted)
          setRequest({
            key: requestKey,
            loading: false,
            error:
              cause instanceof Error ? cause.message : "Could not read pull requests",
          });
      });
    return () => stop.abort();
  }, [owner, repo, state, requestKey, revision, tick]);

  const items = data?.items ?? [];
  const search = query.trim().toLowerCase().replace(/^#/, "");
  const labels = [...new Set(items.flatMap((pr) => pr.labels ?? []))].sort(
    (a, b) => a.localeCompare(b),
  );
  const normalizedHandle = (value: string) =>
    value.trim().replace(/^@/, "").toLowerCase();
  const author = normalizedHandle(authorHandle);
  const reviewer = normalizedHandle(reviewerHandle);
  const authors = [...new Set(items.map((pr) => pr.author))].sort((a, b) =>
    a.localeCompare(b),
  );
  const reviewers = [
    ...new Set(
      items.flatMap((pr) => [...pr.requested_reviewers, ...pr.reviewed_by]),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const visible = items.filter((pr) => {
    const viewer = data?.viewer_login?.toLowerCase();
    const inScope =
      !scope ||
      (Boolean(viewer) &&
        (scope === "authored"
          ? pr.author.toLowerCase() === viewer
          : scope === "requested"
            ? pr.requested_reviewers.some(
                (name) => name.toLowerCase() === viewer,
              )
            : pr.reviewed_by.some((name) => name.toLowerCase() === viewer)));
    return (
      (!search ||
        `${pr.number} ${pr.title} ${pr.author} ${(pr.labels ?? []).join(" ")}`
          .toLowerCase()
          .includes(search)) &&
      (!label || (pr.labels ?? []).includes(label)) &&
      (!checks || pr.ci.status === checks) &&
      (!review || pr.review_status === review) &&
      (!agent || pr.agent_review.status === agent) &&
      inScope &&
      (!author || pr.author.toLowerCase() === author) &&
      (!reviewer ||
        (reviewerRole !== "submitted" &&
          pr.requested_reviewers.some(
            (name) => name.toLowerCase() === reviewer,
          )) ||
        (reviewerRole !== "requested" &&
          pr.reviewed_by.some((name) => name.toLowerCase() === reviewer)))
    );
  });
  const filtered = Boolean(
    query ||
      label ||
      checks ||
      review ||
      scope ||
      agent ||
      authorHandle ||
      reviewerHandle ||
      state !== "open",
  );

  return (
    <section aria-label="Pull request reviews" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
        <h2 className="sdlc-section-heading mr-auto text-lg font-semibold">
          <span className="sdlc-icon"><GitPullRequest className="h-4 w-4" aria-hidden /></span>
          Pull requests
          {data && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {visible.length} of {items.length}
            </span>
          )}
        </h2>
        <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
          <input
            aria-label="Search loaded pull requests"
            placeholder="Search PR, title, author or label"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-48 bg-transparent outline-none"
          />
        </label>
        <select
          aria-label="My involvement"
          title="Uses your connected GitHub account. Review requests include direct user requests; team requests are not expanded."
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          className="max-w-48 rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Everyone</option>
          <option value="authored" disabled={!data?.viewer_login}>
            My PRs
          </option>
          <option value="requested" disabled={!data?.viewer_login}>
            Review requested from me
          </option>
          <option value="reviewed" disabled={!data?.viewer_login}>
            Reviewed by me
          </option>
        </select>
        <select
          aria-label="Filter by GitHub review"
          title="Current-head non-agent review signals. Does not evaluate branch protection; older approvals are excluded."
          value={review}
          onChange={(event) => setReview(event.target.value)}
          className="max-w-48 rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">GitHub review</option>
          {[
            "awaiting review",
            "changes requested",
            "approved review present",
            "commented on current head",
            "unknown",
          ].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by agent verdict"
          value={agent}
          onChange={(event) => setAgent(event.target.value)}
          className="max-w-48 rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Agent review</option>
          {Object.entries(agentLabels).map(([value, title]) => (
            <option key={value} value={value}>
              {title}
            </option>
          ))}
        </select>
        <details className="relative">
          <summary className="cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-sm">
            Filters
            {[
              state !== "open",
              Boolean(label),
              Boolean(checks),
              Boolean(author),
              Boolean(reviewer),
            ].filter(Boolean).length
              ? ` (${[state !== "open", Boolean(label), Boolean(checks), Boolean(author), Boolean(reviewer)].filter(Boolean).length})`
              : ""}
          </summary>
          <div className="absolute right-0 z-20 mt-2 grid w-64 gap-3 rounded-lg border border-border bg-background p-3 shadow-lg [&_select]:w-full [&_select]:max-w-none">
            <label className="grid gap-1 text-xs text-muted-foreground">
              Author
              <input
                aria-label="Author handle"
                list={`${handlesId}-authors`}
                placeholder="@handle · all authors"
                value={authorHandle}
                onChange={(event) => setAuthorHandle(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
              <datalist id={`${handlesId}-authors`}>
                {authors.map((name) => (
                  <option key={name} value={`@${name}`} />
                ))}
              </datalist>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Reviewer
              <input
                aria-label="Reviewer handle"
                list={`${handlesId}-reviewers`}
                placeholder="@handle · all reviewers"
                value={reviewerHandle}
                onChange={(event) => setReviewerHandle(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
              <datalist id={`${handlesId}-reviewers`}>
                {reviewers.map((name) => (
                  <option key={name} value={`@${name}`} />
                ))}
              </datalist>
            </label>
            {reviewer && (
              <select
                aria-label="Reviewer involvement"
                value={reviewerRole}
                onChange={(event) => setReviewerRole(event.target.value)}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="either">Requested or reviewed</option>
                <option value="requested">Review requested from</option>
                <option value="submitted">Has submitted a review</option>
              </select>
            )}
            <p className="text-xs text-muted-foreground">
              Exact handles; suggestions come from this snapshot. Team requests
              are not expanded.
            </p>
            <select
              aria-label="PR state"
              value={state}
              onChange={(event) => setState(event.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="open">Open</option>
              <option value="closed">Closed / merged</option>
              <option value="all">All states</option>
            </select>
            <select
              aria-label="Filter by label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="max-w-44 rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">All labels</option>
              {label && !labels.includes(label) && (
                <option value={label}>{label}</option>
              )}
              {labels.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by checks"
              value={checks}
              onChange={(event) => setChecks(event.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">All checks</option>
              {[
                "passing",
                "failing",
                "pending",
                "no checks",
                "unknown",
                "incomplete",
              ].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </details>
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setLabel("");
              setChecks("");
              setReview("");
              setScope("");
              setAgent("");
              setState("open");
              setAuthorHandle("");
              setReviewerHandle("");
              setReviewerRole("either");
            }}
            className="text-xs text-muted-foreground hover:text-primary"
          >
            Clear filters
          </button>
        )}
        <button
          type="button"
          disabled={loading}
          onClick={() => setTick((current) => current + 1)}
          className="inline-flex items-center gap-2 rounded-md border border-primary/40 px-3 py-2 text-sm text-primary disabled:opacity-50"
        >
          {loading && (
            <Loader2
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          )}
          {loading ? (data ? "Refreshing…" : "Loading…") : "Refresh GitHub"}
        </button>
        <span role="status" className="sr-only">
          {loading && data
            ? "Refreshing pull requests. The previous snapshot remains visible."
            : ""}
        </span>
      </div>
      {loading && !data && (
        <p role="status" className="py-6 text-sm text-muted-foreground">
          Loading current PR reviews and CI evidence…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive"
        >
          {data ? "Refresh failed. Showing the last successful snapshot. " : ""}
          {error}. Check your GitHub connection and use Refresh GitHub to retry.
        </p>
      )}
      {data && (
        <p className="text-xs text-muted-foreground">
          Snapshot {new Date(data.generated_at).toLocaleString()}. {data.note}{" "}
          Search and filters apply to these newest 20 PRs, not the entire
          repository.
          {data.viewer_login
            ? ` Connected as ${data.viewer_login}.`
            : " GitHub identity unavailable; personal filters are disabled."}
        </p>
      )}
      {data && visible.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {items.length
            ? "No PRs in this snapshot match your filters."
            : "No pull requests match this state."}
        </p>
      )}
      <div
        className="space-y-4"
        aria-label="Pull request list"
        aria-busy={loading}
      >
        {visible.map((pr) => (
          <PrCard key={`${owner}/${repo}:${pr.number}:${pr.head_sha}`} pr={pr} owner={owner} repo={repo}
            execution={executions.key === requestKey ? (() => {
              const run = executions.rows.find(row => row.review_execution?.head === pr.head_sha &&
                row.review_execution?.number === pr.number && row.review_execution?.repository?.toLowerCase() === `${owner}/${repo}`.toLowerCase());
              return run ? reviewRunState(run, data?.review_task_id || "", pr.head_sha) : null;
            })() : null} />
        ))}
      </div>
    </section>
  );
}

export function PrCard({ pr, owner, repo, execution }: { pr: PrDashboardItem; owner: string; repo: string; execution?: ReviewRunState | null }) {
  const AgentIcon = agentPresentation[pr.agent_review.status].icon;
  const CheckIcon = pr.ci.status === "passing" ? CheckCircle2 : pr.ci.status === "failing" ? XCircle : pr.ci.status === "pending" ? Clock3 : HelpCircle;
  const [history, setHistory] = useState(false);
  const [detail, setDetail] = useState<
    "checks" | "reviews" | "comments" | null
  >(null);
  const detailId = useId();
  const reviews = pr.reviews
    .filter((review) => history || review.current_head)
    .slice()
    .reverse();
  const comments = pr.comments.filter(
    (comment) => history || !comment.outdated,
  );
  const hiddenReviews = pr.reviews.filter(
    (review) => !review.current_head,
  ).length;
  const outdatedComments = pr.comments.filter(
    (comment) => comment.outdated,
  ).length;
  return (
    <article className="overflow-hidden rounded-xl border border-border/70 bg-card/35">
      <header className="space-y-3 p-5">
        <div className="flex flex-wrap items-start gap-3">
          <a
            className="mr-auto max-w-4xl text-base font-semibold hover:text-primary"
            href={pr.url}
            target="_blank"
            rel="noreferrer"
          >
            #{pr.number} {pr.title}
          </a>
          <span className="rounded-md border border-border bg-secondary/50 px-2 py-1 text-xs">
            {pr.draft ? "Draft · " : ""}
            {pr.state}
          </span>
          <ReReviewButton owner={owner} repo={repo} number={pr.number} head={pr.head_sha} eligible={pr.state === "open" && !pr.draft} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            {pr.author} · Head <code>{pr.head_sha.slice(0, 12)}</code> · Updated{" "}
            {new Date(pr.updated_at).toLocaleString()}
          </span>
          {(pr.labels ?? []).map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5"
            >
              <Tag className="h-3 w-3" aria-hidden />
              {name}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 ${pr.ci.status === "passing" ? "review-status-success" : pr.ci.status === "failing" ? "review-status-error" : pr.ci.status === "pending" ? "review-status-warning" : "border-border text-muted-foreground"}`}
          >
            <CheckIcon className="h-3.5 w-3.5" aria-hidden />
            Checks: {pr.ci.status}
          </span>
          <span className="rounded-md border border-border px-2.5 py-1 text-muted-foreground">
            Reviews: {pr.review_status}
          </span>
          <span
            title="Agent-reported outcome for this commit, not GitHub approval, CI clearance or compliance certification."
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 ${agentPresentation[pr.agent_review.status].tone}`}
          >
            <AgentIcon className="h-3.5 w-3.5" aria-hidden />
            {pr.agent_review.url ? (
              <a
                href={pr.agent_review.url}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                Agent: {agentLabels[pr.agent_review.status]}
              </a>
            ) : (
              `Agent: ${agentLabels[pr.agent_review.status]}`
            )}
          </span>
        </div>
        {execution && <p className="text-xs" aria-live="polite"><span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 ${reviewStatePresentation[execution.state].tone}`}>
          <span aria-hidden="true">{reviewStatePresentation[execution.state].icon}</span>
          Latest run: {reviewStatePresentation[execution.state].label}
          {execution.total ? ` · ${execution.completed}/${execution.total} groups` : ""}
        </span></p>}
        <ReviewSkills report={pr.agent_review.skills} />
        {pr.missing_signals.length > 0 && (
          <p className="text-sm review-status-warning">
            Incomplete evidence: {pr.missing_signals.join(", ")}
          </p>
        )}
      </header>
      <div className="border-t border-border/50 px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          {(
            [
              ["checks", `CI checks (${pr.ci.checks.length})`],
              [
                "reviews",
                `Reviews and agent feedback (${reviews.length}${!history && hiddenReviews ? ` of ${pr.reviews.length}` : ""})`,
              ],
              [
                "comments",
                `Inline code comments (${comments.length}${!history && outdatedComments ? ` of ${pr.comments.length}` : ""})`,
              ],
            ] as const
          ).map(([key, title]) => (
            <button
              key={key}
              type="button"
              aria-expanded={detail === key}
              aria-controls={`${detailId}-${key}`}
              onClick={() =>
                setDetail((current) => (current === key ? null : key))
              }
              className={`inline-flex items-center gap-1 font-medium hover:text-primary ${detail === key ? "text-primary" : "text-muted-foreground"}`}
            >
              <ChevronDown
                className={`h-3 w-3 transition-transform ${detail === key ? "" : "-rotate-90"}`}
                aria-hidden
              />
              {title}
            </button>
          ))}
          {(hiddenReviews > 0 || outdatedComments > 0) && (
            <label className="ml-auto flex items-center gap-2 text-muted-foreground">
              <input
                type="checkbox"
                checked={history}
                onChange={(event) => setHistory(event.target.checked)}
              />
              Include history ({hiddenReviews} reviews, {outdatedComments}{" "}
              comments)
            </label>
          )}
        </div>
        <div
          id={`${detailId}-checks`}
          hidden={detail !== "checks"}
          className="pt-2"
        >
          {pr.ci.checks.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No check details available for this head.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {pr.ci.checks.map((check, index) => (
                <li
                  key={index}
                  className="flex flex-wrap justify-between gap-2"
                >
                  {check.url ? (
                    <a
                      href={check.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      {check.name}
                    </a>
                  ) : (
                    <span>{check.name}</span>
                  )}
                  <span className="text-muted-foreground">
                    {check.conclusion || check.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div
          id={`${detailId}-reviews`}
          hidden={detail !== "reviews"}
          className="pt-2"
        >
          {reviews.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No submitted reviews for this head.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {reviews.map((review, index) => (
                <li
                  key={`${review.url}:${index}`}
                  className="rounded-lg border border-border/50 bg-background/25 p-4 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={review.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-primary hover:underline"
                    >
                      {review.author}: {review.state}
                    </a>
                    <span className="text-xs text-muted-foreground">
                      {review.current_head ? "current head" : "earlier head"}
                    </span>
                  </div>
                  {review.submitted_at && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(review.submitted_at).toLocaleString()}
                    </p>
                  )}
                  {review.task_id && (
                    <p className="mt-2 break-all text-xs text-muted-foreground">
                      Autonomous task <code>{review.task_id}</code> ·{" "}
                      <a
                        href="/autonomous"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        Task history
                      </a>
                    </p>
                  )}
                  {review.skills && (
                    <div className="mt-3"><ReviewSkills report={review.skills} /></div>
                  )}
                  {review.body && (
                    <ReviewBody body={review.body} />
                  )}
                  {review.body_truncated && (
                    <p className="mt-2 text-xs review-status-warning">
                      Summary shortened. Open the GitHub review for the full
                      text.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div
          id={`${detailId}-comments`}
          hidden={detail !== "comments"}
          className="pt-2"
        >
          {comments.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No inline comments in this view.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="rounded-lg border border-border/50 bg-background/25 p-4 text-sm"
                >
                  <a
                    href={comment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all font-medium text-primary hover:underline"
                  >
                    {comment.path}
                    {comment.line ? `:${comment.line}` : ""}
                  </a>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {comment.author}
                    {comment.outdated ? " · outdated diff" : ""}
                  </p>
                  <ReviewBody body={comment.body} />
                  <FindingSkills report={comment.skills} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
