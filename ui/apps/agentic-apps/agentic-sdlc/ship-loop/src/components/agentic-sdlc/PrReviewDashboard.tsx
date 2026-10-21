"use client";

import { useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  CircleAlert,
  GitPullRequest,
  Search,
} from "lucide-react";
import type { PrDashboardItem } from "@/lib/agentic-sdlc/pr-dashboard";
import { PrReviewVisuals } from "./PrReviewVisuals";

type Snapshot = {
  generated_at: string;
  items: PrDashboardItem[];
  note: string;
};

export function PrReviewDashboard({
  owner,
  repo,
  revision = 0,
  showVisuals = false,
}: {
  owner: string;
  repo: string;
  revision?: number;
  showVisuals?: boolean;
}) {
  const [state, setState] = useState("open");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(false);
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
    setLoading(true);
    setError("");
    setData(null);
    fetch(
      `/apps/agentic-sdlc/api/agentic-sdlc/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=${state}`,
      {
        signal: stop.signal,
        cache: "no-store",
      },
    )
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok)
          throw new Error(value.message || "Could not read pull requests");
        return value;
      })
      .then((value) => {
        if (!stop.signal.aborted) setData(value);
      })
      .catch((cause) => {
        if (!stop.signal.aborted) setError(cause.message);
      })
      .finally(() => {
        if (!stop.signal.aborted) setLoading(false);
      });
    return () => stop.abort();
  }, [owner, repo, state, revision, tick]);

  const items = data?.items ?? [];
  const search = query.trim().toLowerCase().replace(/^#/, "");
  const visible = items.filter(
    (pr) =>
      !search ||
      `${pr.number} ${pr.title} ${pr.author}`.toLowerCase().includes(search),
  );
  const stats = [
    { label: "PRs in snapshot", value: items.length, icon: GitPullRequest },
    {
      label: "Awaiting review",
      value: items.filter(
        (pr) =>
          pr.state === "open" &&
          !pr.draft &&
          pr.review_status === "awaiting review",
      ).length,
      icon: CircleAlert,
    },
    {
      label: "Failing checks",
      value: items.filter((pr) => pr.ci.status === "failing").length,
      icon: CheckCircle2,
    },
    {
      label: "Agent reviewed this head",
      value: items.filter((pr) =>
        pr.reviews.some((r) => r.current_head && r.task_id),
      ).length,
      icon: Bot,
    },
  ];

  return (
    <section aria-label="Pull request reviews" className="space-y-4">
      {data && (
        <dl className="grid grid-cols-2 divide-x divide-border/50 rounded-xl border border-border/50 bg-card/30 md:grid-cols-4">
          {stats.map(({ label, value, icon: Icon }) => (
            <div key={label} className="px-4 py-4">
              <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {label}
              </dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-lg font-semibold">Pull requests</h2>
        <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
          <input
            aria-label="Search loaded pull requests"
            placeholder="Search PR, title or author"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-52 bg-transparent outline-none"
          />
        </label>
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
        <button
          type="button"
          disabled={loading}
          onClick={() => setTick((current) => current + 1)}
          className="rounded-md border border-primary/40 px-3 py-2 text-sm text-primary disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh GitHub"}
        </button>
      </div>
      {loading && (
        <p role="status" className="py-6 text-sm text-muted-foreground">
          Loading current PR reviews and CI evidence…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive"
        >
          {error}. Check your GitHub connection and use Refresh GitHub to retry.
        </p>
      )}
      {data && (
        <p className="text-xs text-muted-foreground">
          Snapshot {new Date(data.generated_at).toLocaleString()}. {data.note}{" "}
          Search applies to this snapshot.
        </p>
      )}
      {showVisuals && !error && (
        <PrReviewVisuals items={data ? visible : null} />
      )}
      {data && visible.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {items.length
            ? "No PRs in this snapshot match your search."
            : "No pull requests match this state."}
        </p>
      )}
      <div className="space-y-4">
        {visible.map((pr) => (
          <PrCard key={`${pr.number}:${pr.head_sha}`} pr={pr} />
        ))}
      </div>
    </section>
  );
}

function PrCard({ pr }: { pr: PrDashboardItem }) {
  const [history, setHistory] = useState(false);
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
        </div>
        <p className="text-xs text-muted-foreground">
          {pr.author} · Head <code>{pr.head_sha.slice(0, 12)}</code> · Updated{" "}
          {new Date(pr.updated_at).toLocaleString()}
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span
            className={`rounded-md border px-2.5 py-1 ${pr.ci.status === "passing" ? "border-emerald-500/30 text-emerald-300" : pr.ci.status === "failing" ? "border-red-400/40 text-red-300" : "border-amber-400/30 text-amber-200"}`}
          >
            Checks: {pr.ci.status}
          </span>
          <span className="rounded-md border border-border px-2.5 py-1 text-muted-foreground">
            Reviews: {pr.review_status}
          </span>
          {pr.reviews.some(
            (review) => review.current_head && review.task_id,
          ) && (
            <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 px-2.5 py-1 text-primary">
              <Bot className="h-3 w-3" aria-hidden />
              Agent reviewed current head
            </span>
          )}
        </div>
        {pr.missing_signals.length > 0 && (
          <p className="text-sm text-amber-200">
            Incomplete evidence: {pr.missing_signals.join(", ")}
          </p>
        )}
      </header>
      <div className="space-y-4 border-t border-border/50 px-5 py-4">
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            CI checks ({pr.ci.checks.length})
          </summary>
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
        </details>
        {(hiddenReviews > 0 || outdatedComments > 0) && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={history}
              onChange={(event) => setHistory(event.target.checked)}
            />
            Show earlier-head reviews ({hiddenReviews}) and outdated comments (
            {outdatedComments})
          </label>
        )}
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            Reviews and agent feedback ({reviews.length}
            {!history && hiddenReviews ? ` of ${pr.reviews.length}` : ""})
          </summary>
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
                  {review.body && (
                    <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed">
                      {review.body}
                    </p>
                  )}
                  {review.body_truncated && (
                    <p className="mt-2 text-xs text-amber-200">
                      Summary shortened. Open the GitHub review for the full
                      text.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </details>
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            Inline code comments ({comments.length}
            {!history && outdatedComments ? ` of ${pr.comments.length}` : ""})
          </summary>
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
                  <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed">
                    {comment.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </details>
      </div>
    </article>
  );
}
