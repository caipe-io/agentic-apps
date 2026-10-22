"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Loader2,
  Plus,
  Settings2,
  X,
} from "lucide-react";

const API = "/apps/agentic-sdlc/api/agentic-sdlc";
const button =
  "inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:border-primary/60 disabled:opacity-50";
const input =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
type Choice = { full_name: string; admin: boolean };
type Review = {
  state: string;
  task_id?: string | null;
  team_slug?: string | null;
  can_manage: boolean;
  last_error?: string | null;
  last_dispatch_status?: string | null;
};
type Connection = {
  full_name: string;
  can_administer: boolean;
  delivery_verified: boolean;
  last_received_at?: string | null;
  webhook_url?: string | null;
  reviews_available: boolean;
  reviews: Review;
};
type Options = {
  available: boolean;
  model_name?: string;
  teams: { name: string; slug: string }[];
  more_teams?: boolean;
  message?: string;
};
async function json(path: string, init?: RequestInit) {
  const response = await fetch(API + path, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.message ||
        "The connection could not be updated. Retry or contact your Grid administrator.",
    );
  return body;
}
function repoPath(name: string) {
  return name.split("/").map(encodeURIComponent).join("/");
}

export function RepoConnectionControls({
  repository,
  onConnected,
}: {
  repository?: string;
  onConnected?: (name: string) => void;
}) {
  const [panel, setPanel] = useState<"connect" | "settings" | "guide" | null>(
    null,
  );
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button className={button} onClick={() => setPanel("connect")}>
          <Plus className="h-4 w-4" aria-hidden />
          Add repository
        </button>
        {repository && (
          <button className={button} onClick={() => setPanel("settings")}>
            <Settings2 className="h-4 w-4" aria-hidden />
            Connection & agent
          </button>
        )}
        <button
          className="inline-flex items-center gap-2 px-2 py-2 text-sm text-primary hover:underline"
          onClick={() => setPanel("guide")}
        >
          <BookOpen className="h-4 w-4" aria-hidden />
          Connection guide
        </button>
      </div>
      {panel && (
        <ConnectionDialog
          initialRepo={panel === "settings" ? repository : undefined}
          guideOnly={panel === "guide"}
          onClose={() => setPanel(null)}
          onConnected={onConnected}
        />
      )}
    </>
  );
}

function ConnectionDialog({
  initialRepo,
  guideOnly,
  onClose,
  onConnected,
}: {
  initialRepo?: string;
  guideOnly: boolean;
  onClose: () => void;
  onConnected?: (name: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<Choice[]>([]);
  const [selected, setSelected] = useState("");
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [connected, setConnected] = useState(initialRepo || "");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [teamQuery, setTeamQuery] = useState("");
  const [team, setTeam] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      generation.current++;
    };
  }, []);

  async function findRepos(page = 1) {
    const run = ++generation.current;
    setBusy("Finding repositories");
    setError("");
    try {
      const result = await json(
        `/repos/available?q=${encodeURIComponent(query.trim())}&page=${page}`,
      );
      if (generation.current !== run) return;
      setChoices((previous) =>
        page === 1
          ? result.items
          : [
              ...previous,
              ...result.items.filter(
                (item: Choice) =>
                  !previous.some((p) => p.full_name === item.full_name),
              ),
            ],
      );
      setNextPage(result.next_page);
      setSelected("");
    } catch (e) {
      if (generation.current === run) setError((e as Error).message);
    } finally {
      if (generation.current === run) setBusy("");
    }
  }
  useEffect(() => {
    if (!guideOnly && !initialRepo) void findRepos();
  }, []); // Initial recent repos; searches are explicit.
  useEffect(() => {
    if (!connected) return;
    let live = true,
      timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function refresh() {
      try {
        const value: Connection = await json(
          `/repos/${repoPath(connected)}/connection`,
        );
        if (!live) return;
        setConnection(value);
        setTeam((current) => current || value.reviews.team_slug || "");
        if (!value.delivery_verified && attempts++ < 20) {
          setChecking(true);
          timer = setTimeout(refresh, 3000);
        } else setChecking(false);
      } catch (e) {
        if (live) {
          setChecking(false);
          setError((e as Error).message);
        }
      }
    }
    setConnection(null);
    void refresh();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [connected]);

  async function connect() {
    if (!selected || busy) return;
    setBusy("Connecting repository");
    setError("");
    setMessage("");
    try {
      const [owner, repo] = selected.split("/");
      const result = await json("/repos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner, repo }),
      });
      setConnected(result.item.full_name);
      setBusy("Loading repository state");
      let reconciled = true;
      try {
        await json(`/repos/${repoPath(result.item.full_name)}/sync`, {
          method: "POST",
        });
      } catch {
        reconciled = false;
      }
      onConnected?.(result.item.full_name);
      window.dispatchEvent(
        new CustomEvent("ship-loop:repo-onboarded", {
          detail: { full_name: result.item.full_name },
        }),
      );
      setMessage(
        `Repository connected. ${reconciled ? "Current GitHub state loaded." : "Initial state refresh could not finish; use Refresh GitHub in the PR list to retry."} Checking for a signed delivery. Existing review settings are preserved; connecting a repo never enables a new reviewer.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function loadOptions() {
    setBusy("Loading review options");
    setError("");
    try {
      setOptions(
        await json(`/review-options?q=${encodeURIComponent(teamQuery.trim())}`),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function changeReviews(enabled: boolean) {
    setBusy(
      enabled ? "Creating your review connection" : "Disabling future reviews",
    );
    setError("");
    setMessage("");
    try {
      await json(`/repos/${repoPath(connected)}/reviews`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, team_slug: team }),
      });
      setConnection(await json(`/repos/${repoPath(connected)}/connection`));
      setMessage(
        enabled
          ? "Agent reviews are enabled for future PR openings and new commits. Open a PR to see feedback and inline findings here."
          : "Future app-triggered reviews are off. A review already running may still finish; previous feedback is retained.",
      );
    } catch (e) {
      setError((e as Error).message);
      setConnection(
        await json(`/repos/${repoPath(connected)}/connection`).catch(
          () => null,
        ),
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="repo-connection-title"
      className="fixed inset-0 m-auto max-h-[90vh] w-[calc(100%_-_2rem)] max-w-[760px] overflow-y-auto rounded-xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/70"
    >
      <header className="flex items-start justify-between gap-4 border-b border-border p-5">
        <div>
          <h2 id="repo-connection-title" className="text-lg font-semibold">
            {guideOnly
              ? "Connect a repository to PR reviews"
              : connected
                ? "Repository connection"
                : "Add a repository"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a repo. Setup is automatic. Agent reviews are a separate
            opt-in.
          </p>
        </div>
        <button
          aria-label="Close repository setup"
          className="rounded p-1 hover:bg-muted"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>
      </header>
      <div className="space-y-5 p-5">
        {guideOnly ? (
          <ConnectionGuide />
        ) : (
          <>
            {error && (
              <p
                role="alert"
                className="rounded-md border border-destructive/50 p-3 text-sm"
              >
                {error}
              </p>
            )}
            {message && (
              <p
                role="status"
                className="rounded-md border border-primary/40 p-3 text-sm"
              >
                {message}
              </p>
            )}
            {!connected ? (
              <section className="space-y-3">
                <h3 className="font-medium">1. Choose the repository</h3>
                <p className="text-sm text-muted-foreground">
                  Uses your connected GitHub account. Repository admin access is
                  needed to configure its webhook. No repositories are connected
                  automatically.
                </p>
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void findRepos();
                  }}
                >
                  <label className="min-w-48 flex-1">
                    <span className="sr-only">
                      Find repository by name or owner/repo
                    </span>
                    <input
                      className={input}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Find a repo, or enter owner/repo"
                    />
                  </label>
                  <button className={button} disabled={!!busy}>
                    Find repositories
                  </button>
                </form>
                <label className="block space-y-2 text-sm">
                  <span>Recent repositories you administer</span>
                  <select
                    className={input}
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                    disabled={!!busy}
                  >
                    <option value="">Select a repository…</option>
                    {choices.map((c) => (
                      <option
                        key={c.full_name}
                        value={c.full_name}
                        disabled={!c.admin}
                      >
                        {c.full_name}
                        {!c.admin ? " (admin access required)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {!choices.length && !busy && (
                  <p className="text-sm text-muted-foreground">
                    No matching repos in this page. Enter the exact owner/repo,
                    or check GitHub permissions and organization SSO.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    className={`${button} border-primary/60 text-primary`}
                    disabled={!selected || !!busy}
                    onClick={connect}
                  >
                    Connect selected repository
                  </button>
                  {nextPage && (
                    <button
                      className={button}
                      disabled={!!busy}
                      onClick={() => findRepos(nextPage)}
                    >
                      More repositories
                    </button>
                  )}
                </div>
              </section>
            ) : (
              <>
                <section className="space-y-2 rounded-lg border border-border p-4">
                  <h3 className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    {connected}
                  </h3>
                  <p className="text-sm">
                    {connection?.delivery_verified
                      ? "Signed webhook delivery verified."
                      : checking
                        ? "Waiting for a signed webhook delivery…"
                        : "Connected. Signed delivery has not been confirmed yet; the next subscribed event will verify the connection."}
                  </p>
                  {connection?.last_received_at && (
                    <p className="text-xs text-muted-foreground">
                      Last signed receipt:{" "}
                      {new Date(connection.last_received_at).toLocaleString()}
                    </p>
                  )}
                  {connection?.webhook_url && (
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer">
                        Public webhook destination
                      </summary>
                      <p className="mt-2 break-all">{connection.webhook_url}</p>
                      <p className="mt-1">
                        Signing is managed by Grid. You do not need to copy a
                        secret.
                      </p>
                    </details>
                  )}
                  <button
                    className="text-sm text-primary hover:underline"
                    disabled={!!busy}
                    onClick={async () => {
                      setError("");
                      try {
                        setConnection(
                          await json(
                            `/repos/${repoPath(connected)}/connection`,
                          ),
                        );
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Refresh connection status
                  </button>
                </section>
                <section className="space-y-3">
                  <h3 className="font-medium">
                    2. Autonomous PR reviews{" "}
                    <span className="ml-2 rounded border border-border px-2 py-0.5 text-xs">
                      {connection?.reviews.state === "enabled" ||
                      connection?.reviews.state === "managed"
                        ? "Enabled"
                        : connection?.reviews.state === "provisioning"
                          ? "Setup in progress"
                          : "Off"}
                    </span>
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Optional. On PR creation or new commits, an agent uses the
                    enabling user's connected GitHub credentials to post a
                    COMMENT review and inline findings. It checks security and
                    documented code style. It cannot approve, merge or deploy.
                  </p>
                  {connection?.reviews.state === "managed" ? (
                    <p className="text-sm">
                      This repo already uses the demo review task.{" "}
                      <a
                        className="text-primary underline"
                        href="/autonomous"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Manage it in Autonomous
                      </a>
                      ; connecting the dashboard does not create another
                      reviewer.
                    </p>
                  ) : !connection ? (
                    <p className="text-sm text-muted-foreground">
                      Loading review connection…
                    </p>
                  ) : !connection.can_administer ? (
                    <p className="text-sm text-muted-foreground">
                      Ask a repository administrator to enable reviews.
                    </p>
                  ) : !connection.reviews.can_manage ? (
                    <p className="text-sm text-muted-foreground">
                      Another user owns this review connection. Ask that owner
                      to manage it in Grid.
                    </p>
                  ) : connection.reviews.state === "enabled" ? (
                    <button
                      className={button}
                      disabled={!!busy}
                      onClick={() => changeReviews(false)}
                    >
                      Turn off future agent reviews
                    </button>
                  ) : (
                    <>
                      {connection.reviews.last_error && (
                        <p className="text-sm text-muted-foreground">
                          {connection.reviews.last_error}
                        </p>
                      )}
                      {!connection.reviews_available ? (
                        <p className="text-sm text-muted-foreground">
                          Review activation is not configured here. Ask your
                          Grid administrator; the dashboard connection still
                          works.
                        </p>
                      ) : !options ? (
                        <button
                          className={button}
                          disabled={!!busy}
                          onClick={loadOptions}
                        >
                          Set up agent reviews…
                        </button>
                      ) : options.available ? (
                        <div className="space-y-3 rounded-lg border border-border p-4">
                          <p className="text-sm">
                            Model: {options.model_name}. Setup creates a scoped
                            agent, a scanned conformance skill and a webhook
                            task under your account.
                          </p>
                          <form
                            className="flex gap-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void loadOptions();
                            }}
                          >
                            <input
                              aria-label="Find owner team"
                              className={input}
                              value={teamQuery}
                              onChange={(e) => setTeamQuery(e.target.value)}
                              placeholder="Find owner team"
                            />
                            <button className={button} disabled={!!busy}>
                              Find
                            </button>
                          </form>
                          <label className="block space-y-2 text-sm">
                            <span>Agent owner team</span>
                            <select
                              className={input}
                              value={team}
                              onChange={(e) => setTeam(e.target.value)}
                              disabled={!!busy}
                            >
                              <option value="">Choose a team…</option>
                              {options.teams.map((t) => (
                                <option key={t.slug} value={t.slug}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          {options.more_teams && (
                            <p className="text-xs text-muted-foreground">
                              Showing the first 50 teams. Search to find another
                              team.
                            </p>
                          )}
                          <button
                            className={`${button} border-primary/60 text-primary`}
                            disabled={!team || !!busy}
                            onClick={() => changeReviews(true)}
                          >
                            Enable agent reviews for this repository
                          </button>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {options.message ||
                            "The review model is unavailable. Contact your Grid administrator."}
                        </p>
                      )}
                    </>
                  )}
                  {connection?.reviews.task_id && (
                    <p className="break-all text-xs text-muted-foreground">
                      Task: {connection.reviews.task_id} ·{" "}
                      <a
                        className="text-primary underline"
                        href="/autonomous"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Runs and task settings
                      </a>
                    </p>
                  )}
                  {connection?.reviews.last_dispatch_status && (
                    <p className="text-xs text-muted-foreground">
                      Last app delivery:{" "}
                      {connection.reviews.last_dispatch_status}. Accepted means
                      the task received the event; check its run for the review
                      result.
                    </p>
                  )}
                </section>
              </>
            )}
            <details className="border-t border-border pt-4">
              <summary className="cursor-pointer text-sm text-primary">
                How to connect a repository to this agent
              </summary>
              <div className="pt-4">
                <ConnectionGuide />
              </div>
            </details>
          </>
        )}
        {busy && (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            {busy}…
          </p>
        )}
      </div>
    </dialog>
  );
}

function ConnectionGuide() {
  return (
    <div className="space-y-4 text-sm">
      <ol className="list-decimal space-y-3 pl-5">
        <li>
          <strong>Connect GitHub in Grid.</strong> Open{" "}
          <a
            className="text-primary underline"
            href="/credentials"
            target="_blank"
            rel="noreferrer"
          >
            Credentials
          </a>
          , connect your GitHub account and authorize organization SSO if
          required. The app uses your connected identity.
        </li>
        <li>
          <strong>Select a repository explicitly.</strong> Choose{" "}
          <em>Add repository</em>, find a repo or enter <code>owner/repo</code>,
          select it, then connect. You need repo admin permission plus token
          permission to manage repository webhooks.
        </li>
        <li>
          <strong>Let setup run.</strong> Grid registers the selected repo,
          configures its signed public webhook, and requests a delivery check.
          Wait for “Signed webhook delivery verified.” An empty repository may
          need its first push or PR event. No agent reviews are enabled by this
          step.
        </li>
        <li>
          <strong>Opt into reviews separately.</strong> Open{" "}
          <em>Connection & agent</em>, choose <em>Set up agent reviews</em> and
          an owner team, then explicitly enable. Your Grid account needs
          Autonomous access and permission to create the team's agent. The
          conformance skill must pass its scan.
        </li>
        <li>
          <strong>Open or update a PR.</strong> The reviewer needs
          contents/PR/check/status read access and permission to write PR
          reviews. It reviews future PR openings and new commits, posts evidence
          and inline findings, and the dashboard captures review/check updates.
          Existing PRs are visible without triggering a retroactive agent
          review.
        </li>
      </ol>
      <p className="text-muted-foreground">
        Review signals are advisory; GitHub branch protection and CI/CD retain
        merge and release controls. Turn reviews off in the connection panel to
        stop future app dispatch; an already-running review may finish. Revoke
        credentials or manage the task in Autonomous when offboarding.
      </p>
      <p className="text-muted-foreground">
        No secret pasting is needed. GitHub must deliver to the configured
        public webhook receiver. If setup fails, check connected credentials,
        repository admin access, organization SSO, team permissions and the
        task's run history.
      </p>
    </div>
  );
}
