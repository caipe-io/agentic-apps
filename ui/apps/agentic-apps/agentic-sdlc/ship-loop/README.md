# Agentic SDLC Ship Loop

Full repository-delivery UI extracted from the Apache-2.0 mirror implementation
at the revision recorded in `SOURCE.json`. This includes the overview animation,
repository onboarding, configurable delivery panels, metrics, event feed and
Epic views. It adds a source-backed PR review dashboard.

## Runtime boundary

This is an embedded **CAIPE application**, not a second CAIPE host. It owns its
Next.js UI/API runtime and MongoDB collections. CAIPE supplies app launch,
policy enforcement, navigation, connected credentials and the assistant.
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

| Variable | Purpose |
| --- | --- |
| `AGENTIC_SDLC_OIDC_ISSUER` | Expected OIDC issuer |
| `AGENTIC_SDLC_OIDC_AUDIENCES` | Comma-separated accepted audiences |
| `AGENTIC_SDLC_OIDC_JWKS_URL` | Optional private JWKS URL; issuer verification remains unchanged |
| `AGENTIC_SDLC_CAIPE_API_ORIGIN` | Trusted private CAIPE BFF origin for credential exchange |
| `AGENTIC_SDLC_MONGODB_URI` | App-only database credential |
| `AGENTIC_SDLC_MONGODB_DATABASE` | Database name; default `agentic_sdlc` |
| `GITHUB_WEBHOOK_SECRET` | Server-side signing key shared with the public receiver |
| `AGENTIC_SDLC_GITHUB_WEBHOOK_URL` | Approved public webhook URL; no raw key reaches the browser |
| `AGENTIC_SDLC_GITHUB_API_URL` | Optional GitHub Enterprise REST API base |
| `SHIP_LOOP_ENABLED` | Explicit `false` disables domain routes |

## PR view

Set the runtime environment variable `AGENTIC_SDLC_VIEW=pull_requests` for a
focused PR workspace. The landing page opens the first authorized repository
with a repository selector, current-head review/CI summaries, searchable PRs,
inline feedback and a PR-only activity feed. It hides the issue/Epic, deployment,
simulation and panel-configuration views. Direct Epic links return to the
repository workspace. Leave this variable unset to retain the full Ship Loop.
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
