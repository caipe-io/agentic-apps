# Agentic SDLC Ship Loop

Full repository-delivery UI extracted from the Apache-2.0 mirror implementation
at the revision recorded in `SOURCE.json`. This includes the overview animation,
repository onboarding, configurable delivery panels, metrics, event feed and
Epic views. It adds a source-backed PR review dashboard.

## Runtime boundary

This is an embedded **CAIPE application**, not a second CAIPE host. It owns its
Next.js UI/API runtime and MongoDB collections. CAIPE supplies app launch,
policy enforcement, navigation, connected credentials and the assistant.
The app publishes page context through `RuntimeBridge`; CAIPE owns the single
assistant launcher and chat panel. Do not render a second floating launcher in
the embedded app.
No TOME code, organization data, shared GitHub token or deployment secrets are
included. The previous Node reference server remains for compatibility with
existing contract fixtures; the published app image now builds this runtime.

- Port: 3030; base path: `/apps/agentic-sdlc`.
- Host registration: preserve the mount path and use the explicit trusted
  `forward-user-access-token` mode. Keep the origin private.
- Verify the original access token against OIDC JWKS, issuer and configured
  audiences. Identity is the stable subject, not an email claim.
- Resolve only the current caller's GitHub connection through CAIPE's
  server-only credential exchange. Repository API/data and stream access are
  checked against that caller's GitHub permissions.
- Use an app-owned MongoDB database and a user restricted to that database.
  Existing platform, credential and other-app databases are not required.
- Forward original GitHub bytes, signature, event and delivery ID to the
  internal webhook route. Every accepted event, including ping, requires a
  valid HMAC. Unknown repositories are rejected. A unique delivery index
  prevents replayed events from creating additional stored events.
- Persist before acknowledgement. Recovery polls unprojected events after a
  restart, with bounded retries and processing leases. Use one runtime replica
  initially because the live notification bus is process-local.

## Configuration

| Variable                            | Purpose                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `AGENTIC_SDLC_OIDC_ISSUER`          | Expected OIDC issuer                                                                                                         |
| `AGENTIC_SDLC_OIDC_AUDIENCES`       | Comma-separated accepted audiences                                                                                           |
| `AGENTIC_SDLC_OIDC_JWKS_URL`        | Optional private JWKS URL; issuer verification remains unchanged                                                             |
| `AGENTIC_SDLC_CAIPE_API_ORIGIN`     | Trusted private CAIPE BFF origin for credential exchange and caller-authorized setup                                         |
| `AGENTIC_SDLC_MONGODB_URI`          | App-only database credential                                                                                                 |
| `AGENTIC_SDLC_MONGODB_DATABASE`     | Database name; default `agentic_sdlc`                                                                                        |
| `GITHUB_WEBHOOK_SECRET`             | Server-side signing key shared with the public receiver                                                                      |
| `AGENTIC_SDLC_GITHUB_WEBHOOK_URL`   | Approved public webhook URL; no raw key reaches the browser                                                                  |
| `AGENTIC_SDLC_GITHUB_API_URL`       | Optional GitHub Enterprise REST API base                                                                                     |
| `AGENTIC_SDLC_REVIEW_WORKSPACE_URL` | Optional trusted HTTPS workspace URL used once in published review summaries; no credentials, query or fragment               |
| `AGENTIC_SDLC_REVIEWER_LOGINS`      | Comma-separated GitHub logins allowed to report agent outcomes                                                               |
| `AGENTIC_SDLC_REVIEW_TASK_IDS`      | Comma-separated trusted autonomous review task IDs                                                                           |
| `AGENTIC_SDLC_AUTONOMOUS_ORIGIN`    | Private native Autonomous service origin for signed task hooks; management uses the caller-authorized BFF instead            |
| `AGENTIC_SDLC_REVIEW_MODEL_ID`      | Operator-approved Dynamic Agents model ID for opted-in reviewers                                                             |
| `AGENTIC_SDLC_GITHUB_MCP_ID`        | GitHub MCP server ID; default `mcp-github`                                                                                   |
| `AGENTIC_SDLC_MANAGED_REVIEW_TASKS` | JSON object mapping lowercase `owner/repo` to an existing externally managed task ID; blocks duplicate provisioning/dispatch |
| `SHIP_LOOP_ENABLED`                 | Explicit `false` disables domain routes                                                                                      |

## PR view

Set the runtime environment variable `AGENTIC_SDLC_VIEW=pull_requests` for a
focused PR workspace. The landing page opens the first authorized repository
with a repository selector, current-head review/CI summaries, searchable PRs,
inline feedback and a PR-only activity feed. It hides the issue/Epic, deployment,
simulation and panel-configuration views. Direct Epic links return to the
repository workspace. Leave this variable unset to retain the full Ship Loop.
The original animated delivery-loop graphic remains as a compact 360px header illustration. The workspace keeps the PR list and does not add visual boards. One caller-identity GitHub request supports personal filters.

This is a presentation choice, not an authorization boundary or ingestion filter.
All existing webhook ingestion, persisted history, credentials and MCP routes
remain available under their existing access checks.

The focused activity query filters PR events and PR-linked comments/checks
before pagination. The feed reports its bounded scan window. Review bodies
remain plain text, with source links and truncation notices. Earlier-head reviews
and outdated comments stay available through an explicit history toggle.

Open a repository and use the PR section to inspect draft/open/closed/merged
state, head SHA, current-head check runs and commit statuses, reviews, inline
comments and CAIPE task markers. Review and CI signals do not establish merge
permission. Comments can include resolved/outdated history. Results are bounded
and the UI reports incomplete or unavailable signals, never a fabricated pass.

Webhook projection updates trigger a debounced refresh. Manual GitHub refresh
is also available. The existing repository sync reconciles current GitHub
issues and PRs after missed deliveries. PR review and CI details are read live.
Optional legacy synthetic insight panels return unavailable responses until
source-backed providers are configured. Simulation is absent from this runtime.

## Build

```sh
npm ci --ignore-scripts
npm run build
```

The application image uses `build/Dockerfile.agentic-sdlc`. The standard
multi-application build/release matrix selects it from `apps.manifest.json`.
Never disable JWT verification or use a shared fallback GitHub token to make a
private repository appear connected. Keep webhook ingestion on a separate
queue from autonomous execution so both consumers receive their events.

## Developer review filters

The compact toolbar combines these filters within the newest 20 PRs in the
selected state. It is not a repository-wide GitHub search. A visible count and
empty state retain that scope; label choices come from this same snapshot.

- **My involvement:** My PRs, review requested directly from my connected GitHub
  login, or human reviews submitted by me (including history). Team review
  requests are not expanded. Personal filters are disabled if caller identity
  cannot be retrieved. Agent-marked reviews do not count as human reviews.
- **GitHub review:** current-head approval present, changes requested, awaiting
  review, or comment present. Dismissed and earlier-head approvals never count
  as approval of the current head. These are review signals, not a complete
  branch protection evaluation or permission to merge.
- **Agent review:** no findings, findings raised, incomplete, reviewed without
  a verdict, stale after new commits, absent, or unavailable/unverified.
- **Author / reviewer handles:** select a suggested handle or type an exact
  GitHub login, with optional `@` and case-insensitive matching. Author selects
  PRs authored by that login. Reviewer selects direct review requests, submitted
  non-agent reviews (including history), or either. Author and reviewer combine
  with AND and with the other filters. Suggestions come from the loaded snapshot;
  typing an absent handle yields no matches within that snapshot. Team requests
  are not expanded. These controls add no GitHub API requests.
- **Filters:** author/reviewer handles, PR state, label and check status, plus
  free-text search over PR number, title, author and labels. Clear filters restores
  the default open view and clears handles and reviewer role. Handles also reset
  when switching repositories.

CI, review and inline-comment counts share one disclosure line per PR. Selecting
a count expands its existing evidence in place. History stays available without
an always-visible extra row. The original header animation remains compact.

### Agent outcome protocol

When there are new actionable findings, the reviewer publishes a concise GitHub
**COMMENT** review. An outcome is advisory and separate from non-agent GitHub
approval, CI, and conformance claims.
Never infer no findings from review presence, prose or a passing check.

Configure both reviewer-login and task-ID allowlists. The review must be from
one of those logins and contain the existing task marker with a head matching
GitHub's review `commit_id`. A current-head verdict additionally requires exactly
one marker of this form in the same review body:

```text
<!-- caipe-pr-review:task=TASK_ID;head=HEAD_SHA -->
<!-- caipe-pr-verdict:v1;task=TASK_ID;head=HEAD_SHA;result=no_findings -->
```

Allowed results are `no_findings`, `findings`, and `incomplete`. Task and head
must agree across both markers and the current PR head. `no_findings` means no
actionable findings in the completed review scope, not compliance certification
or merge clearance. Missing required evidence or incomplete inspection should
produce `incomplete`. Concrete actionable findings should produce `findings`,
including findings reported in the summary because inline publication failed.
The latest submitted trusted report for the current head wins. New commits
invalidate an earlier report; old prose-only reviews remain reviewed without a
verdict. A missing allowlist never grants trusted attribution. Review author and
markers are an attribution boundary, not cryptographic proof of model execution.

## Connect a repository and optionally enable reviews

The compact PR workspace retains explicit onboarding through **Add repository**,
**Connection & agent**, and an in-app **Connection guide**. Registration is never
inferred from a webhook or from the repositories a user can see.

1. Connect GitHub in the host's Credentials page and authorize organization SSO
   when required. The connected account needs repo admin access and permission
   to read/manage repository webhooks. Do not paste a token or webhook secret
   into this app.
2. Find a repository using that account or enter exact `owner/repo`, explicitly
   select it, and connect. The server verifies current admin permission, creates
   or updates only the hook matching the configured public URL, and registers
   the canonical GitHub repository ID. Other hooks, existing subscribed events,
   app history, label mappings and review settings are preserved on reconnect.
3. Setup loads current GitHub state and requests GitHub's test **push** delivery
   through the public receiver. This creates no commit and does not fire a
   PR-only reviewer. Signed receipt evidence is separate from mere hook creation.
   Empty repositories or unavailable test delivery may wait for a normal event;
   the UI reports this as unverified. The receiver must fan out the configured
   event types, including `push`, to the app's independent queue.
4. Review activation is a separate, default-off action. Select an owner team and
   explicitly enable it. The current repo administrator must also have host
   Autonomous entitlement, owner-team/agent/tool permissions, and the configured
   model. The conformance skill must pass its security scan. All resource
   management uses the original caller bearer through normal host authorization;
   this app never impersonates ownership headers or uses an admin service token.
5. Setup creates a private scanned conformance skill, a team-owned repository
   reviewer with a narrow GitHub tool allowlist, and a user-owned native webhook
   task. Future non-draft `pull_request.opened`, `pull_request.synchronize` and
   `pull_request.ready_for_review` events can post a concise **COMMENT** review
   only for new logic or security findings, with up to five inline findings, using the
   enabling user's connected GitHub credentials. Contents/PR/check/status read
   and PR review write permissions must be available. There is no retroactive
   agent review during registration, refresh or synchronization.
6. Turn future reviews off in **Connection & agent**. This stops app dispatch
   first, then disables the owner's native task. An already-running review can
   finish; historical feedback remains. The task owner can also stop/manage runs
   through Autonomous. Other administrators cannot take over a binding silently.

Review outcomes remain advisory and tied to the actual current head. Security
and documented style evidence may be `Not verified`; a missing scan is not a
pass. The agent cannot approve, request changes, change code/workflows, merge or
deploy. Native runtime permissions remain authoritative at every run. Team
members able to edit the agent can change its behavior through normal host
permissions; operators should restrict that access appropriately.

Drafts are skipped. Clean/incomplete outcomes remain in task history; public
reviews are reserved for new logic or security defects, deduplicated by root
cause across heads and prior human/bot feedback. Each finding must identify the
trigger, changed-code cause, impact and minimal fix. Style/compliance checklists,
generic test requests and CI transcripts are omitted. A pending CI job alone
does not make source inspection incomplete. Summaries stay under 120 words;
inline findings under 150 words plus a small suggested patch. Five inline
comments is a ceiling, not a target; related symptoms share one comment.

Published findings use labeled Unicode severity cues: 🔴 Critical, 🟠 Major,
🟡 Minor, and 🔵 Review info for relevant context. Minor still means an evidenced
logic defect; optional test/style suggestions stay suppressed. A summary starts
with `🔎 Agentic SDLC review · N new findings` and includes one workspace footer
when `AGENTIC_SDLC_REVIEW_WORKSPACE_URL` is configured. The link is deployment-owned
and never derived from webhook/PR content. No external badge images are needed.
Dashboard status badges use the same semantic color families with text labels
and readable light/dark variants; a generic findings status does not infer severity.

The public receiver must verify the original GitHub HMAC and preserve event,
delivery ID and signed payload when forwarding to the app. Configure preexisting
reviewers in `AGENTIC_SDLC_MANAGED_REVIEW_TASKS` **before enabling onboarding** to
avoid a second review path for the same repo. Their existing queue/task/skill is
preserved and managed in Autonomous rather than by this app. An example mapping
is `{"example/repository":"existing-review-task-id"}`.

### Durable review dispatch and recovery

Only registered, signed `opened`/`synchronize`/`ready_for_review` events for an
open, non-draft PR and an enabled binding create a review outbox entry in the
same persisted event document. The app signs
its serialization with that task's separate high-entropy secret and preserves
the original delivery ID. Native per-task HMAC validation, structured repo/action
filters and durable delivery deduplication remain enabled. Manual repo sync
creates no review outbox entry. Dispatch acceptance is not review completion.

Recovery runs every 15 seconds with leases, bounded batches, exponential retry
and an eight-attempt cap. Failures/uncertain final attempts remain inspectable in
the stored event; the connection panel exposes the binding's latest delivery
status, while actual findings and run results belong in Autonomous/GitHub. Review
prompts also guard duplicate findings across heads, draft/stale heads and a connected
user's unrelated pending review. A repo rename requires reconnect plus explicit
disable/re-enable before reviews target the new canonical name.

Existing reviewers retain their saved policy after an app update. Adopting the
new defaults involves the private skill's `skill_content` and task `llm_prompt`
(followed by a passing security rescan), the autonomous task's `prompt` and
`trigger.filter`, and the agent's `system_prompt` and `updated_at` cache version.
The templates are in `review-policy.ts` and `review-eligibility.ts`; the policy
marker is `caipe-pr-publication-policy:v4`. Apply these through the owner's
authorized host APIs/UI, preserving resource IDs, ownership, model, tool
allowlist (with only the start-reaction `add_issue_comment` addition), enabled
state and webhook signing key. An app image update or
disable/re-enable alone does not replace a saved skill. Running reviews retain
their captured instructions; app and saved-policy rollback are separate changes.

After verifying an eligible current head, reviewers add a 👀 PR-body reaction
through `add_issue_comment` with `reaction: "eyes"` (no comment body). This marks
that review has started at least once; it remains after completion and is not a
live running indicator. GitHub deduplicates that account/reaction across retries
and heads. Reaction failure is recorded privately and does not block inspection.

The PR dashboard reads GitHub review artifacts. Completed reviews publish one
concise COMMENT review per current head, including no new actionable findings,
with the reviewed SHA, outcome marker, coverage and actual CI/inspection limits.
Retries and repeated CI updates do not publish duplicate task/head markers.
Incomplete inspections remain in task history and must not claim no findings.
Earlier unresolved findings must be rechecked against the current code. Neither
a no-findings result nor silence is GitHub approval.

`sdlc_review_bindings` lives only in the app database. Task
secrets are AES-256-GCM encrypted, bound to the immutable connection key, using an
HKDF-derived key from the server-managed webhook secret. Raw task keys never
reach the browser. Back up this database and its operator-managed master key
together. **Before rotating the webhook master key**, disable bindings and
rewrap their secrets or explicitly re-enable them with the new key; do not
silently rotate it underneath active review bindings. Do not connect this app's
review dispatcher to a public unauthenticated management API.

GitHub's test-delivery behavior is documented in the
[repository webhook REST API](https://docs.github.com/en/rest/repos/webhooks#test-the-push-repository-webhook).

### Re-review from the PR dashboard

Each PR card has **Re-review** for its displayed commit. Open, non-draft PRs
can be submitted to the existing configured reviewer; the list remains visible
while inline status tracks submission, queueing and execution. Completion means
the run finished, not that GitHub approved the PR or that no defects exist.
The current-head verdict and task history remain the review evidence.

The server re-fetches the PR, rejects changed heads, verifies the enabled
repository binding and forwards the original caller to Autonomous. Only the
task owner or a platform administrator with Autonomous access can run it.
Retries reuse a request UUID to avoid duplicate submissions. Status polling
stops after 20 minutes; the run can continue in Autonomous history.

Rollout order: deploy Autonomous with `manual_run_context_version: 1`, then
this app. Existing saved reviewers need the manual-review task policy marker
`caipe-pr-manual-review-policy:v1` and publication policy v5 in their saved task,
agent and private skill prompts, followed by a passing private-skill scan.
Do not overwrite customized prompts or tool scopes. Until migrated, the button
returns a setup message rather than running an older task without PR context.
Newly configured reviewers use the updated policy automatically.

Manual re-review inspects an already reviewed commit again. Previously reported
findings and unchanged clean summaries are not posted again; a new distinct
finding can be published after all normal identity, draft and current-head checks.


### Reloading a saved reviewer policy

Save Autonomous task updates through the authenticated task update API
(`PUT /api/autonomous/tasks/{id}`), preserving the complete task configuration,
ownership, agent, metadata, enabled state and webhook signing key. This API also
re-registers the task in the running webhook/scheduler registry. Direct MongoDB
updates alone leave the old task prompt active in that registry until reload.
If a migration already updated the database, re-save that same configuration
through the API; do not rotate the signing key or restart unrelated tasks.

Verify the runtime registration and the next genuine run's `request_prompt`
against the expected policy version or prompt hash. A database read or a passing
skill scan alone does not prove which task prompt the live receiver will use.
Do not trigger a public review merely to test configuration reload. Existing run
snapshots remain historical evidence and must not be rewritten.

### Running version

A sticky bar at the top of every Agentic SDLC view displays the running image's
release version and short commit SHA. Hover over it for the full commit SHA.
The release pipeline supplies `APP_BUILD_VERSION` and `APP_BUILD_REVISION` to
the image; the server reads them at runtime, so preview and production show
their own deployed build. Missing metadata is explicitly shown as unavailable.
The indicator uses the selected appearance theme's colors.
