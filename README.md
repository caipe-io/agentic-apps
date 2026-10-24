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

The usage disclaimer names **LLM Gateway** by default. Deployments can set
`LITELLM_GATEWAY_NAME` to their gateway’s display name (for example,
`Example LLM Gateway`). Blank values use the default; names are HTML-escaped.
Organization-specific branding belongs in deployment configuration.

- The runtime loads every `/key/list` page (up to 100 keys per request) before searching,
  sorting, and paginating the browser results. Incomplete or stalled upstream pagination
  returns an error instead of a partial list.
- Search fields disable browser autocomplete and text correction, use non-login
  identifiers, and include password-manager ignore hints. The user picker has its
  own search form and retains its accessible result dropdown. Browsers or password
  managers may override page hints.
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

### Personal usage and budgets

- **User usage** is the first/default tab. It opens with a single searchable user/key
  picker and loads usage only after a selection (or an explicit user/key link).
  There are no My usage/Find users mode buttons or automatic identity-based selections.
- **Overview**, the second tab, shows gateway activity totals, model token/spend pie charts,
  a usage trend, and an always-visible model totals table. Periods are current month, 3, 6, and 12
  calendar months including the current month, or all retained history. Long periods
  use monthly trend buckets. Pie colors match between token and spend charts; small
  model shares are grouped as Other and missing attribution is labeled explicitly.
- `/api/overview` reuses the existing aggregated activity loader without a key filter.
  It never sums per-key budget counters or combines user/key totals. It uses the same
  read authorization and configured gateway credential as the existing analytics API;
  upstream access and retention determine coverage. Incomplete responses fail visibly.
  All time requests the full date range from the Unix epoch and labels coverage from
  the first retained activity date. Overview reads are coalesced and cached in process
  for four hours, bounded to ten period/date snapshots. Only derived reports and private
  per-key sums are retained. UTC date changes use a new snapshot. Refresh data bypasses
  cached results while concurrent refreshes share one load; failures are not cached.
  The page displays the snapshot update time and checks expiry when returning to a tab.
- **All users** ranks virtual keys by recorded **current-calendar-month** spend in UTC,
  with independent search, sorting, and pagination. Monthly spend comes from reconciled
  daily key-attributed records; missing/unmatched attribution is unavailable, never
  replaced with lifetime or budget-cycle counters. Budget balances keep their own reset
  cycles and are labeled separately. The ranking shares the current-month Overview
  snapshot, so searching and paging do not reload aggregate activity.
  View usage opens **User usage** for the same current month without changing the
  ranking's filters or page. Personal searches do not filter the ranking.
- The user picker searches the authorized catalog by username, email, or key name.
  Matching users appear directly in a searchable dropdown, grouped by owner email
  with their virtual keys underneath. Select a key to open its usage; typing alone
  does not change the current usage view. Arrow keys, Home/End, Enter, and Escape
  support keyboard selection. The dropdown has paging, loading, empty, and retry states.
  The selected owner and key remain visible while searching or paging other results.
  The key spend table is available in **All users**.
  Browsing all keys never selects the first or highest-spend user automatically.
- The selected owner/key remain visible. The verified JWT email is used only to label
  whether the selected key belongs to the viewer; admins follow the same identity matching.
  URL parameters and unsigned identity headers cannot establish ownership or authorization.
- Budgets come from the selected key's `/key/info`, its owner's `/user/info`, and its
  team's `/team/info` where present. The dashboard distinguishes key, user, and team
  limits, spend, remaining balance, and reset periods. A missing key limit does not imply
  that the owner has no budget. Lookup failures remain unavailable, not unlimited.
- The main budget card shows a configured key limit first, then a team limit for team
  keys or a user limit for personal keys. Other scope records remain visible below it.
  User and team budgets cover more than the selected key; their spend is never mixed
  with key-only usage totals. Enforcement remains the gateway's responsibility.
- Key details are cached server-side for 30 seconds and concurrent pricing/usage reads
  share the lookup. Refresh data requests fresh budget details.

### Shareable usage views

- Open `/apps/litellm?user=example-user&period=month` to search a username, alias,
  or email and select an exact match or a unique search result. Ambiguous searches show
  the matching dropdown options for selection; missing users do not fall back to another key.
  Several keys with the same alias or owner require an explicit key selection; a copied
  key-specific link identifies one key unambiguously.
- Optional `key=vk_…` selects an opaque virtual-key ID across the complete catalog,
  including keys outside the directory's current page. Missing key IDs require a new
  selection. These IDs are selectors, not credentials.
- `period` accepts `current`, `month`, `3m`, `6m`, or `12m`; a valid URL period takes
  precedence over the host's default range. `sort` accepts `spend`, `spend-asc`, or `name`.
- Without a user/key filter, the default is the **User usage** search page.
  `tab=overview` opens **Overview**, which also accepts `period=all`.
  `tab=usage`, `tab=users`, and `tab=calculator` explicitly select User usage, All users,
  and the model cost calculator respectively. User/key links open the individual usage view.
  Existing `#availableModels` links open the calculator tab.
- **Copy link** preserves the active view: overview period, all-users search/sort, or
  the selected key, alias, period, sort, and detail tab. If clipboard access fails, the
  dashboard displays the link for manual copy.
  Recipients still need normal dashboard access; links never include API tokens.
- The host forwards query parameters through the iframe and runtime proxy. The dashboard
  reads its own URL, so this also works when launched outside the host shell.

### Model cost anomalies

- Each model spike automatically loads the top ten users/keys by **added spend**
  against the same four-week weekday baseline. Model-filtered key spend must
  reconcile with the exact model comparison before attribution is shown.
- Contributor rows show expected spend, actual spend, added spend, and share of
  all positive key increases. Decreases on other keys are shown as offsets;
  unresolved/deleted key ownership stays unknown. Shared credentials identify
  an owner, not necessarily the person or workload responsible.
- **View key usage** preserves the anomaly's exact completed UTC dates in a
  shareable `period=custom&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` link.
  Custom ranges are validated and bounded to 42 completed days.
- Attribution reads run at concurrency two, coalesce with agent tool requests,
  and cache only derived, sanitized results for 30 seconds (at most 40 entries).
  The read-only `litellm_get_anomaly_contributors` MCP tool gives the agent the
  same model-specific attribution without exposing raw key material.
- Anomalies shows a spinner, elapsed time, and request stages while gateway data
  loads and the agent runs. Stages reflect actual request boundaries; the invoke
  endpoint does not stream individual tool progress or percentage completion.
- Cancel stops the browser request. Agent work already started on the server may
  continue. Changes to analysis settings cancel pending browser work.

- **Analyze with agent** creates an authorized conversation and invokes the configured
  LiteLLM agent through the shared host invoke client. Opening the tab loads only
  calculated candidates; agent runs require the explicit button action.
- Daily-activity MCP evidence returns only compact numeric totals, supports an exact
  model filter, and limits requests to 42 days. User/key breakdowns are excluded so
  supporting evidence stays within gateway response buffers.
- The agent calls `litellm_get_cost_anomalies` with the same dates and thresholds,
  then uses daily activity or model inventory MCP evidence as needed. Its structured
  response (native structured output or final JSON on older invoke runtimes) must
  match the candidate snapshot and dates, and cite MCP evidence for
  each assessed model. Agent-cited evidence is not an independently verified tool trace.
- The agent prioritizes up to five models by cost impact and labels additional
  candidates as a partial investigation. All calculated candidates remain visible.
- Agent findings separate observations, possible causes, recommended checks, and
  limitations. Partial, unavailable, or malformed responses are shown explicitly;
  calculated spend comparisons remain visible and are not replaced by agent estimates.
  Changing settings or refreshing cancels the pending browser request and clears stale
  results; cancellation does not guarantee that a host-side agent run stops immediately.

- **Anomalies** compares a selected 1/3/4/7/14 completed UTC day window with the
  preceding 28 completed days. The current UTC day is excluded.
- Expected spend and usage sum the corresponding weekday means from those four weeks.
  A spend-spike candidate must meet both thresholds: default $25 above baseline and
  50% higher spend. Thresholds are editable. A zero-spend baseline is labeled **New
  spend**, uses only the dollar threshold, and has no percentage increase.
- Candidates show expected/actual spend, dollar impact, percentage change, the largest
  daily increase, input/output/total tokens, requests, and cache read/write input tokens
  when supplied. Daily expected/actual costs are inspectable below each finding.
  Cache tokens may overlap input counts; these categories must not be summed.
- These are transparent review rules, not a statistical confidence score, budget
  forecast, or proof of a deployment/configuration cause. They analyze gateway records
  only and do not reproduce provider billing anomaly estimates or issue notifications.
- All baseline and analysis dates must have model breakdowns that reconcile to their
  gateway spend totals. Missing dates or partial responses are not treated as zero.
  Incomplete coverage shows **Insufficient history** instead of a clean/no-anomaly
  conclusion. Models with missing spend or negative adjustments are excluded visibly;
  unavailable token/cache fields stay unknown.
- `/api/anomalies` uses the existing read authorization and aggregated activity source.
  Bounded history loads are coalesced and cached for 30 seconds; changing thresholds
  reuses the source snapshot. Only derived model metrics reach the browser.
- `tab=anomalies&days=7&minImpact=25&minIncrease=50` opens a shareable analysis view.
  The default landing tab remains **User usage**, followed by **Overview**.

### Model prices and key provisioning

- **User usage** contains key usage charts, model activity, and budget details.
  **Model cost calculator** contains the calculator, searchable model prices, and key
  provisioning. Key selection is shared, and calculator lines survive tab switches.
- The Model cost calculator tab includes a searchable, paginated catalog from the deployment's
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
  `/user/info` for inherited restrictions (both are read when present). Only model lists, status, expiry, and RPM/TPM
  limits reach the browser. Raw credentials, key hashes, provider configuration,
  user keys, and arbitrary metadata are excluded.
- The catalog labels explicit key model/group/wildcard matches and unresolved inheritance.
  These are configuration descriptions, **not authorization decisions**. Team membership,
  organization policies, access groups, aliases, budgets, and other runtime checks may
  further restrict calls. Lookup failures are visible and never treated as unrestricted access.
- The model catalog can be browsed without a selected key; provisioning requires a key.
  Refresh data reloads both prices and provisioning for the current selection.

References: [LiteLLM model pricing](https://docs.litellm.ai/docs/proxy/model_cost_map),
[model access](https://docs.litellm.ai/docs/proxy/model_access),
[budget scopes](https://docs.litellm.ai/docs/proxy/users).

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
