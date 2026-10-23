# CAIPE Agentic Apps

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)

Source-backed agentic-app runtimes for the [CAIPE](https://github.com/caipe-io/ai-platform-engineering) platform.
The source-backed runtimes serve their dashboard, readiness and liveness endpoints, context endpoint,
and app-scoped MCP endpoint;
Jira Project Dashboard currently uses a host-configured agent integration and is included here so
the runtime image has one source boundary. CAIPE deployment configuration
remains in the separate `platform-apps-deployment` repository.

> [!WARNING]
> These applications are CAIPE agentic-app runtimes. They are intended to run inside the CAIPE
> agentic-apps environment and are not standalone applications. Running a server or container by
> itself does not provide the CAIPE gateway, user identity, authorization policy, agent bindings,
> MCP services, secrets, or host popup integration that the apps require. They are not supported
> for independent deployment or direct unauthenticated use.

## Included applications

| Application | Mount path | Port | Dedicated agent | Purpose |
| --- | --- | ---: | --- | --- |
| FinOps Command Center | `/apps/finops` | 3010 | `agent-finops` | AWS Cost Explorer workflows |
| Weather Lab | `/apps/weather` | 3020 | `agent-weather-agent` | Open-Meteo forecast and air-quality data |
| Agentic SDLC | `/apps/agentic-sdlc` | 3030 | `agent-agentic-sdlc` | Repository delivery and ship-loop workflows |
| LiteLLM Usage Dashboard | `/apps/litellm` | 3042 | `agent-litellm` | LiteLLM usage, spend, model, and virtual-key operations |
| OSS Repo Report Card | `/apps/oss-repo-management` | 3040 | `agent-oss-repo-report-card` | Repository health and OSS readiness evidence |
| Jira Project Dashboard | `/apps/jira-project-dashboard` | 3041 | `agent-jira-agent` | Jira project and delivery metrics |

The source-backed applications follow the CAIPE app-agent-MCP triplet:

```text
Signed-in user -> CAIPE app gateway -> app runtime -> dedicated agent -> app MCP -> source system
```

Dashboard context is untrusted navigation context. Agents must call the declared MCP tools for
factual answers. Runtime tokens and upstream credentials stay server-side.

## Agentic SDLC Ship Loop

The full Ship Loop UI and PR review dashboard are in
[`agentic-sdlc/ship-loop`](ui/apps/agentic-apps/agentic-sdlc/ship-loop/README.md).
Its image uses a dedicated Next.js build while retaining the CAIPE app gateway,
connected-user GitHub access and separate autonomous-review execution.

## Local development

Requirements: Node.js 22 or newer and Docker for container checks.

```bash
npm ci
npm run check
npm test
npm run smoke
```

The smoke test runs all six servers with JWT verification disabled on loopback only. Production
deployments must keep forwarded-bearer validation enabled and configure the corresponding
`deploy/caipe/agentic-app.json`, `agent.yaml`, and `mcp-server.yaml` files where the app owns its MCP.

## Container images

The [application image manifest](apps.manifest.json) is the source of truth for image builds.
The release workflow builds every listed application in parallel and publishes one multi-architecture
image per app, for example:

```text
ghcr.io/caipe-io/agentic-apps-finops:0.0.1
ghcr.io/caipe-io/agentic-apps-litellm-usage-dashboard:0.0.1
```

Adding an application to `apps.manifest.json` is sufficient to add it to the build and publish
matrix, provided it follows the standard app directory and `server.mjs` contract.

## LiteLLM data handling

The dashboard reads LiteLLM usage through its server-side runtime, while contextual chat uses the
dedicated `agent-litellm` agent and LiteLLM MCP server. It reports authorized virtual keys using
opaque selectors and may show owners, budgets, spend, token counts, requests, model activity, and
daily or monthly trends. Raw key material, bearer tokens, and other credentials never reach the
browser. Access remains subject to CAIPE identity and policy.

- The runtime loads every `/key/list` page (up to 100 keys per request) before searching,
  sorting, and paginating the browser results. Incomplete or stalled upstream pagination
  returns an error instead of a partial list.
- Search accepts key aliases, usernames, and owner emails. Email searches also match an
  exact username alias without the domain. These matches select display rows; they do not
  change authorization.
- The key directory defaults to highest spend and offers username and lowest-spend sorting.
  Spend in that directory is each key's current budget-cycle or lifetime spend, independent
  of the selected usage period. Rows represent keys, so an owner can have several rows.
- Key snapshots are cached for 30 seconds and concurrent loads share one request. Refresh
  data reloads the complete catalog and the selected usage report. Both timestamps appear
  below the charts.
- Usage charts show daily/monthly spend, tokens, or requests. Most-used models default to
  token ranking and can be ranked by requests or spend; the top 10 appear as bars and the
  full model breakdown is available in the details table. Missing activity dates use zero
  bars. Unknown budgets are labeled explicitly without a utilization meter.

### Shareable usage views

- Open `/apps/litellm?user=example-user&period=month` to search a username, alias,
  or email and select an exact match or a unique search result. Ambiguous searches show
  the matching directory for selection; missing users do not fall back to another key.
  If several keys have the same exact alias or owner, the current sort determines which
  one opens; a copied key-specific link identifies one key unambiguously.
- Optional `key=vk_…` selects an opaque virtual-key ID across the complete catalog,
  including keys outside the directory's current page. Missing key IDs require a new
  selection. These IDs are selectors, not credentials.
- `period` accepts `current`, `month`, `3m`, `6m`, or `12m`; a valid URL period takes
  precedence over the host's default range. `sort` accepts `spend`, `spend-asc`, or `name`.
- `tab=calculator` opens the model cost calculator tab directly. The default is the
  usage and budgets tab; existing `#availableModels` links open the calculator tab.
- **Copy link** creates a public app URL with the selected key, readable alias, period,
  sorting, and active tab. If clipboard access fails, the dashboard displays the link for manual copy.
  Recipients still need normal dashboard access; links never include API tokens.
- The host forwards query parameters through the iframe and runtime proxy. The dashboard
  reads its own URL, so this also works when launched outside the host shell.

### Model prices and key provisioning

- **Usage & budgets** contains usage charts, model activity, and budget details.
  **Model cost calculator** contains the calculator, searchable model prices, and key
  provisioning. Key selection is shared, and calculator lines survive tab switches.
- Compare models links to a searchable, paginated catalog from the deployment's
  `/model/info`. Input and output rates are shown in USD per million text tokens.
  Users can adjust input/output token counts and sort by estimated cost or either rate.
- Add catalog models to the multi-line token cost calculator. Each line has independent
  input/output tokens per request and a request count; duplicate and remove lines to
  compare workloads. Input cost, output cost, and line totals roll up to a workload total.
  Invalid counts or missing prices mark the total incomplete and show the known subtotal.
  Lines remain in the current page session and use refreshed catalog prices; models that
  disappear are marked unavailable. Calculating costs does not make model API calls.
- Price estimates use the supplied token rates only. Cache discounts, long-context and
  service tiers, and non-token charges are excluded. Missing rates remain unknown;
  explicitly configured zero rates remain zero. Non-token model modes are not estimated.
  Rows represent deployments, so a load-balanced alias can have multiple price rows.
- Selecting a virtual key loads `/key/info` using its hash, plus `/team/info` or
  `/user/info` for inherited restrictions. Only model lists, status, expiry, and RPM/TPM
  limits reach the browser. Raw credentials, key hashes, provider configuration,
  user keys, and arbitrary metadata are excluded.
- The catalog labels explicit key model/group/wildcard matches and unresolved inheritance.
  These are configuration descriptions, **not authorization decisions**. Team membership,
  organization policies, access groups, aliases, budgets, and other runtime checks may
  further restrict calls. Lookup failures are visible and never treated as unrestricted access.
- The model catalog can be browsed without a selected key; provisioning requires a key.
  Refresh data reloads both prices and provisioning for the current selection.

References: [LiteLLM model pricing](https://docs.litellm.ai/docs/proxy/model_cost_map),
[model access](https://docs.litellm.ai/docs/proxy/model_access).

## FinOps AWS account selection

Set `FINOPS_AWS_ACCOUNT_LIST` to the same comma-separated `profile:account-id` list configured on
the AWS MCP server. The dashboard exposes canonical profile names, requires an explicit choice
when multiple profiles are available, and passes only the selected profile to the FinOps agent.
`FINOPS_AWS_DEFAULT_PROFILE` may select a valid default. When no account list is configured, the
runtime retains the single-account environment-credential behavior.

## Governance

See [CONTRIBUTING.md](CONTRIBUTING.md), [MAINTAINERS.md](MAINTAINERS.md), [SECURITY.md](SECURITY.md),
and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). This repository follows CAIPE’s Apache-2.0 licensing,
DCO sign-off, and Conventional Commit requirements.
