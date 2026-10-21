"use client";
import { useEffect, useState } from "react";
import type { PrDashboardItem } from "@/lib/agentic-sdlc/pr-dashboard";
type Snapshot = {
  generated_at: string;
  items: PrDashboardItem[];
  note: string;
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
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = (event: Event) => {
      const v = (event as CustomEvent).detail;
      if (v?.owner !== owner || v?.repo !== repo) return;
      clearTimeout(timer);
      timer = setTimeout(() => setTick((t) => t + 1), 3000);
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
    fetch(
      `/apps/agentic-sdlc/api/agentic-sdlc/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=${state}`,
      { signal: stop.signal, cache: "no-store" },
    )
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.message || "Could not read pull requests");
        return v;
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!stop.signal.aborted) setLoading(false);
      });
    return () => stop.abort();
  }, [owner, repo, state, revision, tick]);
  return (
    <section
      className="rounded-2xl border border-border bg-card/50 p-5"
      aria-label="Pull request reviews"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-lg font-semibold">Pull requests</h2>
        <select
          aria-label="PR state"
          value={state}
          onChange={(e) => setState(e.target.value)}
          className="rounded border border-border bg-background p-2"
        >
          <option value="open">Open</option>
          <option value="closed">Closed / merged</option>
          <option value="all">All</option>
        </select>
        <button
          disabled={loading}
          onClick={() => setTick((t) => t + 1)}
          className="rounded border border-primary/40 px-3 py-2 text-primary disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh GitHub"}
        </button>
      </div>
      {error && (
        <p role="alert" className="my-3 text-destructive">
          {error}
        </p>
      )}
      {data && (
        <p className="my-3 text-xs text-muted-foreground">
          Snapshot: {new Date(data.generated_at).toLocaleString()}. {data.note}
        </p>
      )}
      {data?.items.length === 0 && (
        <p className="py-5 text-muted-foreground">No matching pull requests.</p>
      )}
      <div className="space-y-4">
        {data?.items.map((pr) => (
          <article
            key={pr.number}
            className="rounded-xl border border-border p-4"
          >
            <div className="flex flex-wrap gap-2">
              <a
                className="mr-auto font-semibold hover:text-primary"
                href={pr.url}
                target="_blank"
                rel="noreferrer"
              >
                #{pr.number} {pr.title}
              </a>
              <span className="rounded bg-secondary px-2 text-sm">
                {pr.draft ? "Draft · " : ""}
                {pr.state}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {pr.author} · Head <code>{pr.head_sha.slice(0, 12)}</code> ·
              Checks: {pr.ci.status} · Reviews: {pr.review_status}
            </p>
            <p className="text-xs text-muted-foreground">
              GitHub updated {new Date(pr.updated_at).toLocaleString()}
            </p>
            {pr.missing_signals.length > 0 && (
              <p className="mt-2 text-sm text-amber-400">
                Incomplete signals: {pr.missing_signals.join(", ")}
              </p>
            )}
            {pr.ci.checks.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm">
                  CI checks ({pr.ci.checks.length})
                </summary>
                <ul className="mt-2 space-y-1 text-sm">
                  {pr.ci.checks.map((c, i) => (
                    <li key={i}>
                      {c.url ? (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary"
                        >
                          {c.name}
                        </a>
                      ) : (
                        c.name
                      )}
                      : {c.conclusion || c.status}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm">
                Reviews and agent feedback ({pr.reviews.length})
              </summary>
              <ul className="mt-2 space-y-2 text-sm">
                {pr.reviews.map((r, i) => (
                  <li key={i}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary"
                    >
                      {r.author}: {r.state}
                    </a>{" "}
                    · {r.current_head ? "current head" : "earlier head"}
                    {r.task_id && (
                      <span>
                        {" "}
                        · Autonomous task <code>{r.task_id}</code> ·{" "}
                        <a
                          href="/autonomous"
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary"
                        >
                          Open task history
                        </a>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm">
                Inline comments ({pr.comments.length}, including review history)
              </summary>
              <div className="mt-2 space-y-3">
                {pr.comments.map((c) => (
                  <div
                    key={c.id}
                    className="rounded border border-border p-3 text-sm"
                  >
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary"
                    >
                      {c.author} · {c.path}
                      {c.line ? `:${c.line}` : ""}
                      {c.outdated ? " · outdated diff" : ""}
                    </a>
                    <p className="mt-2 whitespace-pre-wrap break-words">
                      {c.body}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
