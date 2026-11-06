"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCw } from "lucide-react";
import {
  startPreparedReview,
  reviewRunProgress,
  resumeReviewRun,
} from "@/lib/agentic-sdlc/manual-review-client";

import { reviewStatePresentation, type ReviewRunState } from "@/lib/agentic-sdlc/review-run-state.mjs";

type Props = {
  owner: string;
  repo: string;
  number: number;
  head: string;
  eligible: boolean;
};
export function ReReviewButton({ owner, repo, number, head, eligible }: Props) {
  const [run, setRun] = useState<{ taskId: string; runId: string } | null>(
    null,
  );
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<ReviewRunState | null>(null);
  const [resumable, setResumable] = useState<{ taskId: string; runId: string } | null>(null);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const requestId = useRef<string | null>(null);
  const stop = useRef<AbortController | null>(null);
  const url = `/apps/agentic-sdlc/api/agentic-sdlc/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/review`;
  useEffect(
    () => () => {
      stop.current?.abort();
    },
    [],
  );

  useEffect(() => {
    stop.current?.abort();
    setRun(null); setResumable(null); setProgress(null); setStatus("");
    busy.current = false; requestId.current = null;
  }, [owner, repo, number, head]);

  useEffect(() => {
    if (!run) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 20 * 60 * 1000;
    async function poll() {
      try {
        const value = await reviewRunProgress(run!.taskId, run!.runId, head, controller.signal);
        if (controller.signal.aborted) return;
        setProgress(value);
        setStatus(value.state);
        if (!["queued", "running"].includes(value.state)) {
          busy.current = false;
          requestId.current = null;
          setResumable(value.resumable ? run : null);
          setRun(null);
          window.dispatchEvent(new CustomEvent("agentic-sdlc:repo-synced", { detail: { owner, repo } }));
          return;
        }
        if (Date.now() >= deadline)
          throw new Error(
            "Status tracking paused. The review may still be running; check Autonomous history.",
          );
        timer = setTimeout(poll, 5000);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not read review status.",
        );
        setStatus("tracking paused");
        busy.current = false;
        setRun(null);
      }
    }
    timer = setTimeout(poll, 1500);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [run, url, owner, repo, head]);

  async function submit() {
    if (busy.current) return;
    busy.current = true;
    requestId.current ||= crypto.randomUUID();
    stop.current?.abort();
    const controller = new AbortController();
    stop.current = controller;
    setStatus("submitting");
    setError("");
    setProgress(null);
    try {
      if (resumable) {
        const accepted = await resumeReviewRun(resumable.taskId, resumable.runId, controller.signal);
        if (controller.signal.aborted) return;
        setResumable(null);
        setStatus("queued");
        setRun(accepted);
        return;
      }
      const response = await fetch(`${url}/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ head_sha: head, request_id: requestId.current }),
        signal: controller.signal,
      });
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.message || "Could not request review.");
      if (controller.signal.aborted) return;
      const accepted = await startPreparedReview(value, controller.signal);
      if (controller.signal.aborted) return;
      setStatus("queued");
      setRun(accepted);
    } catch (cause) {
      if (controller.signal.aborted) return;
      busy.current = false;
      setStatus("");
      setError(
        cause instanceof Error ? cause.message : "Could not request review.",
      );
      // Keep the same identifier: a timeout may have happened after acceptance.
    }
  }
  const active = ["submitting", "queued", "pending", "running"].includes(
    status,
  );
  return (
    <div className="flex max-w-sm flex-col items-end gap-1">
      <button
        type="button"
        onClick={submit}
        disabled={!eligible || active}
        title={
          eligible
            ? "Run a fresh review of this commit with the configured agent"
            : "Reviews require an open, non-draft pull request"
        }
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-2.5 py-1.5 text-xs hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {active ? (
          <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden />
        ) : (
          <RotateCw className="h-3.5 w-3.5" aria-hidden />
        )}
        {active ? `Review ${status}…` : resumable ? "Resume review" : "Re-review"}
      </button>
      <span
        role="status"
        aria-live="polite"
        className="text-xs text-muted-foreground"
      >
        {progress ? (
          <span className={`inline-flex flex-wrap items-center gap-1 rounded border px-2 py-1 ${reviewStatePresentation[progress.state].tone}`}>
            <span aria-hidden="true">{reviewStatePresentation[progress.state].icon}</span>
            {reviewStatePresentation[progress.state].label}
            {progress.total ? ` · ${progress.completed}/${progress.total} groups` : ""}
          </span>
        ) : !active && status ? `Review ${status}` : ""}
        {progress?.reason && <span className="mt-1 block max-w-sm text-left">{progress.reason}</span>}
      </span>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
