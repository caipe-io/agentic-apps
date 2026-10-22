import {
  authorizedRepoIds,
  getGitHubAccessToken,
} from "@/lib/agentic-sdlc/agentic-sdlc-auth";
// Registered repositories are always filtered through the caller's GitHub access.

import { getAgenticSdlcReposCollection } from "@/lib/agentic-sdlc/mongo-collections";
import { withAgenticSdlcGate } from "@/lib/agentic-sdlc/guard";
import { getRepoCounts } from "@/lib/agentic-sdlc/repo-stats";
import { requireAgenticSdlcReader } from "@/lib/agentic-sdlc/agentic-sdlc-auth";
import { hashWebhookSecret } from "@/lib/agentic-sdlc/webhook-verify";
import type { OnboardedRepo } from "@/types/agentic-sdlc";

interface RepoListItem {
  repo_id: string;
  owner: string;
  name: string;
  full_name: string;
  sandbox_environment: string;
  webhook_status: OnboardedRepo["webhook_status"];
  last_activity_at: string | null;
  counts: {
    open_epics: number;
    in_flight_subtasks: number;
    prs_awaiting_review: number;
    deploys_24h: number;
  };
}

const GITHUB_SHIP_LOOP_EVENTS = [
  "issues",
  "issue_comment",
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
  "push",
  "check_run",
  "check_suite",
  "deployment",
  "deployment_status",
  "label",
];

async function handle(req: Request): Promise<Response> {
  const reader = await requireAgenticSdlcReader(req);
  if (!reader) {
    return Response.json(
      { error: "unauthenticated", message: "Sign in required." },
      { status: 401 },
    );
  }

  const allowedRepoIds = await authorizedRepoIds(req);
  const repos = await getAgenticSdlcReposCollection();
  const cursor = repos.find(
    { offboarded_at: null, repo_id: { $in: allowedRepoIds } },
    {
      projection: {
        _id: 0,
        repo_id: 1,
        owner: 1,
        name: 1,
        full_name: 1,
        sandbox_environment: 1,
        webhook_status: 1,
        webhook_last_event_at: 1,
        updated_at: 1,
      },
      sort: { onboarded_at: -1 },
      limit: 100,
    },
  );

  const docs = await cursor.toArray();

  const items: RepoListItem[] = (
    await Promise.all(
      docs.map(async (doc) => ({
        repo_id: doc.repo_id,
        owner: doc.owner,
        name: doc.name,
        full_name: doc.full_name,
        sandbox_environment: doc.sandbox_environment,
        webhook_status: doc.webhook_status,
        last_activity_at: lastActivityAt(doc),
        counts: await getRepoCounts(doc.repo_id),
      })),
    )
  ).sort(
    (a, b) =>
      Date.parse(b.last_activity_at ?? "") -
      Date.parse(a.last_activity_at ?? ""),
  );

  return Response.json({ items });
}

export const GET = withAgenticSdlcGate(handle);

function lastActivityAt(doc: {
  webhook_last_event_at?: Date | null;
  updated_at?: Date | null;
}): string | null {
  const dates = [doc.webhook_last_event_at, doc.updated_at].filter(
    (date): date is Date => date instanceof Date,
  );
  if (dates.length === 0) return null;
  return new Date(
    Math.max(...dates.map((date) => date.getTime())),
  ).toISOString();
}

interface OnboardRepoRequest {
  owner?: unknown;
  repo?: unknown;
  callback_url?: unknown;
  webhook_secret?: unknown;
  sandbox_environment?: unknown;
}

async function handlePost(req: Request): Promise<Response> {
  const reader = await requireAgenticSdlcReader(req);
  if (!reader) {
    return Response.json(
      { error: "unauthenticated", message: "Sign in required." },
      { status: 401 },
    );
  }

  let body: OnboardRepoRequest;
  try {
    body = (await req.json()) as OnboardRepoRequest;
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }

  const owner = stringField(body.owner).trim();
  const repo = stringField(body.repo).trim();
  const secret = process.env.GITHUB_WEBHOOK_SECRET || "";
  const callback = parseWebhookCallbackUrl(
    stringField(body.callback_url).trim(),
  );
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(owner) ||
    !/^[a-zA-Z0-9_.-]{1,100}$/.test(repo) ||
    [".", ".."].includes(repo)
  )
    return Response.json(
      { message: "Select a repository in owner/repo form." },
      { status: 400 },
    );
  if (!callback || secret.length < 8)
    return Response.json(
      {
        message:
          "Repository webhook setup is not configured. Contact your Grid administrator.",
      },
      { status: 503 },
    );
  try {
    const { Octokit } = await import("@octokit/rest");
    const client = new Octokit({
      auth: await getGitHubAccessToken(req),
      baseUrl: process.env.AGENTIC_SDLC_GITHUB_API_URL,
      request: { timeout: 15000 },
    });
    const { data: meta } = await client.repos.get({ owner, repo });
    if (!meta.permissions?.admin)
      return Response.json(
        {
          message:
            "Your connected GitHub account needs repository administrator permission to configure the webhook.",
        },
        { status: 403 },
      );
    const [canonicalOwner, canonicalRepo] = meta.full_name.split("/");
    const target = { owner: canonicalOwner, repo: canonicalRepo };
    const hooks = await client.paginate(client.repos.listWebhooks, {
      ...target,
      per_page: 100,
    });
    const existing = hooks.find((h) => h.config.url === callback);
    const events = existing?.events.includes("*")
      ? ["*"]
      : [
          ...new Set([
            ...(existing?.events || []),
            ...GITHUB_SHIP_LOOP_EVENTS,
            "workflow_run",
            "sub_issues",
          ]),
        ];
    const config = {
      url: callback,
      content_type: "json",
      insecure_ssl: "0",
      secret,
    };
    const { data: hook } = existing
      ? await client.repos.updateWebhook({
          ...target,
          hook_id: existing.id,
          active: true,
          events,
          config,
        })
      : await client.repos.createWebhook({
          ...target,
          name: "web",
          active: true,
          events,
          config,
        });
    const now = new Date();
    const repos = await getAgenticSdlcReposCollection();
    // Reconnecting must not erase history, label mappings, opt-in or ownership.
    await repos.updateOne(
      { repo_id: String(meta.id) },
      {
        $set: {
          owner: canonicalOwner,
          name: canonicalRepo,
          full_name: meta.full_name,
          default_branch: meta.default_branch,
          webhook_id: hook.id,
          webhook_secret_hash: hashWebhookSecret(secret),
          offboarded_at: null,
          updated_at: now,
          connection_check_started_at: now,
        },
        $setOnInsert: {
          repo_id: String(meta.id),
          sandbox_environment:
            stringField(body.sandbox_environment).trim().slice(0, 100) ||
            "sandbox",
          webhook_status: "unknown",
          webhook_last_event_at: null,
          label_to_stage_overrides: {},
          onboarded_by_user_id: reader.user.id,
          onboarded_at: now,
          created_at: now,
        },
      },
      { upsert: true },
    );
    let verification = "waiting_for_delivery";
    try {
      // GitHub delivers its latest push through the existing public receiver;
      // this does not create a commit or fire the PR-only reviewer.
      await client.repos.testPushWebhook({ ...target, hook_id: hook.id });
      verification = "delivery_check_requested";
    } catch {
      /* Empty repositories or missing test permission can wait for their first real event. */
    }
    return Response.json(
      {
        item: {
          repo_id: String(meta.id),
          full_name: meta.full_name,
          webhook_id: hook.id,
          webhook_url: callback,
          webhook_events: events,
          github_webhook_settings_url: `https://github.com/${meta.full_name}/settings/hooks/${hook.id}`,
          verification,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const status = (error as { status?: number }).status;
    return Response.json(
      {
        message:
          status === 401
            ? "Reconnect GitHub in Grid Credentials and authorize organization SSO if required."
            : status === 403
              ? "GitHub denied webhook setup. Check repository admin access, token permissions and organization SSO."
              : status === 404
                ? "Repository not found or not accessible through your connected GitHub account."
                : "Repository setup could not finish. Retry; an existing matching webhook is reused.",
      },
      { status: status && [401, 403, 404].includes(status) ? status : 502 },
    );
  }
}

export const POST = withAgenticSdlcGate(handlePost);

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseWebhookCallbackUrl(value: string): string | null {
  const configured = process.env.AGENTIC_SDLC_GITHUB_WEBHOOK_URL;
  if (!configured) return null;
  try {
    const expected = new URL(configured);
    if (
      expected.protocol !== "https:" ||
      expected.username ||
      expected.password
    )
      return null;
    if (value && new URL(value).href !== expected.href) return null;
    return expected.href;
  } catch {
    return null;
  }
}
