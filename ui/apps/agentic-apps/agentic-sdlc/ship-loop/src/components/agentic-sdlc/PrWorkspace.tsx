"use client";

import { ArrowLeft, ExternalLink, GitPullRequest, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "./AppLink";
import { LiveStatusIndicator } from "./LiveStatusIndicator";
import { PrReviewDashboard } from "./PrReviewDashboard";
import { RepoConnectionControls } from "./RepoConnectionControls";
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
  const preferred = useRef("");
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
          items.some((r) => r.full_name === preferred.current)
            ? preferred.current
            : items.some((r) => r.full_name === current)
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
    window.addEventListener("ship-loop:repo-onboarded", load);
    return () => {
      active?.abort();
      window.removeEventListener("agentic-sdlc:portfolio-synced", load);
      window.removeEventListener("ship-loop:repo-onboarded", load);
    };
  }, [retry]);

  const repository = repos?.find((r) => r.full_name === selected);
  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 p-5 pb-24 md:p-8 md:pb-24">
      <CompactPrHeader
        title="Pull request reviews"
        subtitle="Follow agent feedback, current-head CI checks and inline code comments in one workspace."
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border/50 py-4">
        {!!repos?.length && (
          <label className="flex flex-wrap items-center gap-3 text-sm font-medium">
            Repository
            <select
              aria-label="Repository"
              value={selected}
              onChange={(event) => {
                preferred.current = event.target.value;
                setSelected(event.target.value);
              }}
              className="max-w-full rounded-md border border-border bg-background px-3 py-2"
            >
              {repos.map((r) => (
                <option key={r.repo_id} value={r.full_name}>
                  {r.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <RepoConnectionControls
            repository={selected || undefined}
            onConnected={(name) => {
              preferred.current = name;
              setRetry((value) => value + 1);
            }}
          />
          {repository && (
            <Link
              className="text-sm text-primary hover:underline"
              href={`/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`}
            >
              Open repository workspace
            </Link>
          )}
        </div>
      </div>
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
          Use Add repository to select a repo and configure its connection.
          Agent reviews are optional and remain off until you enable them
          separately.
        </section>
      ) : (
        <>
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
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 p-5 pb-24 md:p-8 md:pb-24">
      <Link
        href="/"
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All repositories
      </Link>
      <CompactPrHeader
        title={`${owner}/${repo}`}
        subtitle="Agent reviews, CI evidence and inline feedback for each PR head."
        action={
          <a
            href={`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            Open GitHub PRs
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        }
      />
      <RepoConnectionControls repository={`${owner}/${repo}`} />
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
      <PrReviewDashboard key={`${owner}/${repo}`} owner={owner} repo={repo} />
      <RepoEventFeed
        key={`${owner}/${repo}:events`}
        owner={owner}
        repo={repo}
        scope="pull_requests"
      />
    </>
  );
}

function CompactPrHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <header className="grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium text-primary">
          <GitPullRequest className="h-4 w-4" aria-hidden />
          Agentic SDLC
        </p>
        <h1 className="break-words text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{subtitle}</p>
        {action}
      </div>
      <AgenticSdlcAnimation className="max-w-[360px] md:w-[360px]" />
    </header>
  );
}
