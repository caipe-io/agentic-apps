"use client";

import { useState } from "react";
import { Bot, Clock3, GitPullRequest, Layers, Sparkles } from "lucide-react";
import type { PrDashboardItem } from "@/lib/agentic-sdlc/pr-dashboard";
import {
  CinematicRing,
  SvgRing,
  type RingStage,
} from "./panels/ShipLoopRingPanel";

const REVIEW_LOOP: readonly RingStage[] = [
  { id: "open", label: "Open", angle: -90, color: "#a78bfa" },
  { id: "checks", label: "Checks", angle: -18, color: "#22d3ee" },
  { id: "review", label: "Review", angle: 54, color: "#60a5fa" },
  { id: "feedback", label: "Feedback", angle: 126, color: "#2dd4bf" },
  { id: "human", label: "Human", angle: 198, color: "#fbbf24" },
];

const LANES = [
  {
    id: "draft",
    title: "Draft",
    tone: "text-violet-300",
    border: "border-violet-400/30",
    glow: "bg-violet-500/10",
  },
  {
    id: "checks",
    title: "Check evidence",
    tone: "text-cyan-300",
    border: "border-cyan-400/30",
    glow: "bg-cyan-500/10",
  },
  {
    id: "review",
    title: "Awaiting review",
    tone: "text-blue-300",
    border: "border-blue-400/30",
    glow: "bg-blue-500/10",
  },
  {
    id: "feedback",
    title: "Feedback posted",
    tone: "text-teal-300",
    border: "border-teal-400/30",
    glow: "bg-teal-500/10",
  },
  {
    id: "closed",
    title: "Closed / merged",
    tone: "text-amber-300",
    border: "border-amber-400/30",
    glow: "bg-amber-500/10",
  },
] as const;

function laneFor(pr: PrDashboardItem): (typeof LANES)[number]["id"] {
  if (pr.state !== "open") return "closed";
  if (pr.ci.status !== "passing" || pr.missing_signals.length > 0)
    return "checks";
  if (pr.reviews.some((review) => review.current_head)) return "feedback";
  return pr.draft ? "draft" : "review";
}

export function PrReviewVisuals({
  items,
}: {
  items: PrDashboardItem[] | null;
}) {
  const [mode, setMode] = useState<"svg" | "cinematic">("svg");
  const [view, setView] = useState<"lanes" | "timeline">("lanes");
  const count = items ? `${items.length} PRs` : "—";
  return (
    <section
      className="glass-panel relative overflow-hidden rounded-2xl border border-primary/20 p-4 md:p-5"
      aria-label="PR review visuals"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
      />
      <header className="relative flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            The PR review loop
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            The animation illustrates the workflow. PR cards and totals use this
            GitHub snapshot.
          </p>
        </div>
        <div
          className="flex gap-1 rounded-lg border border-border/50 bg-background/35 p-1"
          aria-label="PR board view"
        >
          <button
            type="button"
            aria-pressed={view === "lanes"}
            onClick={() => setView("lanes")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs ${view === "lanes" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
          >
            <Layers className="h-3.5 w-3.5" aria-hidden />
            Swim lanes
          </button>
          <button
            type="button"
            aria-pressed={view === "timeline"}
            onClick={() => setView("timeline")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs ${view === "timeline" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
          >
            <Clock3 className="h-3.5 w-3.5" aria-hidden />
            Timeline
          </button>
        </div>
      </header>
      <div className="relative mt-5 grid items-start gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
        <div className="relative rounded-xl border border-border/30 bg-background/20 p-3">
          {mode === "cinematic" ? (
            <CinematicRing
              eventsPerMin={0}
              stages={REVIEW_LOOP}
              caption="PR SNAPSHOT"
              value={count}
              accessibleLabel={`Illustrative PR workflow ring. ${items ? count + " in the snapshot" : "Snapshot loading or unavailable"}.`}
            />
          ) : (
            <SvgRing
              eventsPerMin={0}
              failures={null}
              stages={REVIEW_LOOP}
              caption="PR SNAPSHOT"
              value={count}
              accessibleLabel={`Illustrative PR workflow ring. ${items ? count + " in the snapshot" : "Snapshot loading or unavailable"}.`}
            />
          )}
          <div className="mt-2 flex justify-center gap-2">
            <button
              type="button"
              aria-pressed={mode === "svg"}
              onClick={() => setMode("svg")}
              className={`rounded-md border px-2.5 py-1 text-xs ${mode === "svg" ? "border-primary/40 text-primary" : "border-border/40 text-muted-foreground"}`}
            >
              SVG
            </button>
            <button
              type="button"
              aria-pressed={mode === "cinematic"}
              onClick={() => setMode("cinematic")}
              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs ${mode === "cinematic" ? "border-primary/40 text-primary" : "border-border/40 text-muted-foreground"}`}
            >
              <Sparkles className="h-3 w-3" aria-hidden />
              Cinematic
            </button>
          </div>
        </div>
        {items === null ? (
          <p className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
            Waiting for the PR snapshot…
          </p>
        ) : view === "lanes" ? (
          <div
            className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
            aria-label="PR swim lanes"
          >
            {LANES.map((lane) => {
              const prs = items.filter((pr) => laneFor(pr) === lane.id);
              return (
                <section
                  key={lane.id}
                  className={`min-w-0 rounded-xl border ${lane.border} ${lane.glow}`}
                  aria-label={`${lane.title}: ${prs.length} PRs`}
                >
                  <h4
                    className={`flex items-center gap-2 border-b border-border/30 px-3 py-3 text-xs font-semibold ${lane.tone}`}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-pulse"
                      aria-hidden
                    />
                    {lane.title}
                    <span className="ml-auto tabular-nums">{prs.length}</span>
                  </h4>
                  <div className="space-y-2 p-2">
                    {prs.length === 0 ? (
                      <p className="py-6 text-center text-[11px] text-muted-foreground/70">
                        No PRs
                      </p>
                    ) : (
                      prs
                        .slice(0, 3)
                        .map((pr) => <VisualPrCard key={pr.number} pr={pr} />)
                    )}
                    {prs.length > 3 && (
                      <p className="px-1 py-2 text-[10px] text-muted-foreground">
                        {prs.length - 3} more in the PR list below
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <ol
            className="relative ml-2 space-y-4 border-l border-primary/30 pl-5"
            aria-label="Recent PR updates"
          >
            {items.length === 0 && (
              <li className="py-8 text-sm text-muted-foreground">
                No PR updates in this snapshot.
              </li>
            )}
            {items
              .slice()
              .sort(
                (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at),
              )
              .slice(0, 6)
              .map((pr) => (
                <li key={pr.number} className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-[26px] top-3 h-3 w-3 rounded-full border border-primary/60 bg-primary/30 shadow-[0_0_12px_hsl(var(--primary)/0.4)]"
                  />
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    {new Date(pr.updated_at).toLocaleString()} · Latest GitHub
                    update
                  </p>
                  <VisualPrCard pr={pr} />
                </li>
              ))}
            {items.length > 6 && (
              <li className="text-xs text-muted-foreground">
                Showing the six latest PR updates. The complete snapshot is in
                the PR list below.
              </li>
            )}
          </ol>
        )}
      </div>
      <p className="relative mt-4 text-[11px] text-muted-foreground">
        Lanes prioritize closed state, missing evidence or pending/failing
        checks, then current-head feedback. Drafts keep their label. Feedback
        does not grant merge permission.
      </p>
    </section>
  );
}

function VisualPrCard({ pr }: { pr: PrDashboardItem }) {
  const agentReview = pr.reviews.some(
    (review) => review.current_head && review.task_id,
  );
  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noreferrer"
      className="glass-panel hover-glow block rounded-lg border border-border/40 p-3 transition duration-300 motion-safe:hover:-translate-y-0.5"
    >
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-primary">
        <GitPullRequest className="h-3 w-3" aria-hidden />#{pr.number}
        {pr.draft && (
          <span className="ml-auto text-muted-foreground">Draft</span>
        )}
      </p>
      <p className="break-words text-xs font-medium leading-relaxed">
        {pr.title}
      </p>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Checks: {pr.ci.status}
      </p>
      {agentReview && (
        <p className="mt-2 flex items-center gap-1 text-[10px] text-teal-300">
          <Bot className="h-3 w-3" aria-hidden />
          Agent feedback on this head
        </p>
      )}
    </a>
  );
}
