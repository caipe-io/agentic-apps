"use client";

import { ArrowLeft, ExternalLink, GitPullRequest, Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import Link from "./AppLink";
import { LiveStatusIndicator } from "./LiveStatusIndicator";
import { PrReviewDashboard } from "./PrReviewDashboard";
import { RepoEventFeed } from "./RepoEventFeed";
import { AgenticSdlcAnimation } from "./visualizations/AgenticSdlcAnimation";
import { useAgenticSdlcPortfolioLiveRefresh } from "@/hooks/use-agentic-sdlc-portfolio-live-refresh";
import { useRepoAgenticSdlcLiveRefresh } from "@/hooks/use-repo-agentic-sdlc-live-refresh";

type Repository = {
  repo_id: string;
  owner: string;
  name: string;
  full_name: string;
};

export function PrWorkspaceHome() {
  const [repos, setRepos] = useState<Repository[] | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useAgenticSdlcPortfolioLiveRefresh({ enabled: true });

  useEffect(() => {
    let active: AbortController | undefined;
    async function load() {
      active?.abort();
      const stop = new AbortController();
      active = stop;
      setError("");
      try {
        const response = await fetch(
          "/apps/agentic-sdlc/api/agentic-sdlc/repos",
          {
            cache: "no-store",
            signal: stop.signal,
          },
        );
        if (!response.ok)
          throw new Error(
            "Could not load your connected repositories. Check your GitHub connection and try again.",
          );
        const body = await response.json();
        if (stop.signal.aborted) return;
        const items: Repository[] = body.items ?? [];
        setRepos(items);
        setSelected((current) =>
          items.some((r) => r.full_name === current)
            ? current
            : (items[0]?.full_name ?? ""),
        );
      } catch (cause) {
        if (!stop.signal.aborted) {
          // Clear the previous selection if access or connectivity changed.
          setRepos(null);
          setSelected("");
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load repositories.",
          );
        }
      }
    }
    void load();
    window.addEventListener("agentic-sdlc:portfolio-synced", load);
    return () => {
      active?.abort();
      window.removeEventListener("agentic-sdlc:portfolio-synced", load);
    };
  }, [retry]);

  const repository = repos?.find((r) => r.full_name === selected);
  return (
    <main className="relative isolate mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-5 pb-24 md:p-8 md:pb-24">
      <PrWorkspaceBackdrop />
      <PrWorkspaceHero
        title="Pull request reviews"
        subtitle="Follow agent feedback, current-head CI checks and inline code comments, with the delivery loop in view."
      />
      {error ? (
        <div
          role="alert"
          className="space-y-3 rounded-xl border border-destructive/40 p-5 text-sm"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="rounded-md border border-border px-3 py-2"
          >
            Retry repositories
          </button>
        </div>
      ) : repos === null ? (
        <p
          role="status"
          className="flex items-center gap-2 py-8 text-sm text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading connected repositories…
        </p>
      ) : repos.length === 0 ? (
        <section className="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
          <h2 className="mb-2 font-medium text-foreground">
            No connected repositories in your scope
          </h2>
          Connect GitHub and ask your app administrator to register a repository
          for PR review.
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border/50 py-4">
            <label className="flex flex-wrap items-center gap-3 text-sm font-medium">
              Repository
              <select
                aria-label="Repository"
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
                className="max-w-full rounded-md border border-border bg-background px-3 py-2"
              >
                {repos.map((r) => (
                  <option key={r.repo_id} value={r.full_name}>
                    {r.full_name}
                  </option>
                ))}
              </select>
            </label>
            {repository && (
              <Link
                className="text-sm text-primary hover:underline"
                href={`/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`}
              >
                Open repository workspace
              </Link>
            )}
          </div>
          {repository && (
            <PrWorkspacePanels
              key={repository.full_name}
              owner={repository.owner}
              repo={repository.name}
            />
          )}
        </>
      )}
    </main>
  );
}

export function PrRepoWorkspace({
  owner,
  repo,
}: {
  owner: string;
  repo: string;
}) {
  return (
    <main className="relative isolate mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-5 pb-24 md:p-8 md:pb-24">
      <PrWorkspaceBackdrop />
      <Link
        href="/"
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All repositories
      </Link>
      <PrWorkspaceHero
        title={`${owner}/${repo}`}
        subtitle="Agent reviews, CI evidence and inline feedback for each PR head."
        action={
          <a
            href={`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/20"
          >
            Open GitHub PRs
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        }
      />
      <PrWorkspacePanels owner={owner} repo={repo} />
    </main>
  );
}

function PrWorkspacePanels({ owner, repo }: { owner: string; repo: string }) {
  const live = useRepoAgenticSdlcLiveRefresh({ owner, repo, enabled: true });
  return (
    <>
      <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
        <p>
          GitHub supplies the review and check evidence. Merge and release
          controls remain in GitHub and CI/CD.
        </p>
        <LiveStatusIndicator status={live.status} label="PR events" />
      </div>
      <PrReviewDashboard
        key={`${owner}/${repo}`}
        owner={owner}
        repo={repo}
        showVisuals
      />
      <RepoEventFeed
        key={`${owner}/${repo}:events`}
        owner={owner}
        repo={repo}
        scope="pull_requests"
      />
    </>
  );
}

function PrWorkspaceBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div
        className="absolute -left-40 -top-32 h-[640px] w-[640px] rounded-full opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, hsl(var(--gradient-start) / 0.4), transparent)",
        }}
      />
      <div
        className="absolute -right-32 -top-16 h-[600px] w-[600px] rounded-full opacity-25 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, hsl(var(--gradient-mid) / 0.4), transparent)",
        }}
      />
      <div
        className="absolute left-1/3 top-[360px] h-[500px] w-[500px] rounded-full opacity-20 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, hsl(var(--gradient-end) / 0.35), transparent)",
        }}
      />
    </div>
  );
}

function PrWorkspaceHero({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <header className="grid items-center gap-6 py-2 lg:grid-cols-12 lg:py-4">
      <div className="space-y-4 lg:col-span-5">
        <p className="flex items-center gap-2 text-sm font-medium text-primary">
          <GitPullRequest className="h-4 w-4" aria-hidden />
          Agentic SDLC
        </p>
        <h1 className="gradient-text break-words text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
          {title}
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
          {subtitle}
        </p>
        {action}
      </div>
      <div className="lg:col-span-7">
        <AgenticSdlcAnimation />
        <p className="-mt-2 text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          Delivery lifecycle · PR review workspace
        </p>
      </div>
    </header>
  );
}
