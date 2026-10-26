# FinOps analytics

- `/apps/finops` opens **Analytics**, followed by Accounts, Services, and Anomalies.
- Inventory-style browsing uses AWS SDK v3 Cost Explorer snapshots. Agents run only
  for explicit investigations and contextual questions through the existing MCP flow.
- Account/service/period filters, search, sort, and service pagination use the cache.
  Copy link and browser history preserve the view. The optional host
  `queryNavigation` capability synchronizes the outer address bar, as for EC2.

## Data and cache

- Source: `GetCostAndUsage`, `UnblendedCost`, USD, daily service groups. Every
  `NextPageToken` is followed; repeated tokens, malformed rows, identity mismatch,
  non-USD metrics, or snapshot limits fail the snapshot rather than publish a
  truncated total. Negative credits/adjustments are retained.
- Default view: current month through the last completed UTC day. Prior month and
  3/6/12 calendar-month views reuse up to 13 calendar months of daily history.
- Each account is verified with STS and queried with its exact `LINKED_ACCOUNT`
  filter. Payer and member accounts cannot silently overlap in fleet totals.
  Configure each account ID once; profile names never select local credentials.
- Snapshots are shared within the workload's deployment-configured, read-only scope,
  after app JWT/scope authorization. No browser-supplied account/role ARN is accepted.
- Warm all configured accounts at startup and refresh every eight hours. Concurrent
  reads share in-flight requests; at most two account pulls run concurrently. The
  in-memory cache is bounded to 64 MiB and warms again after a restart.
- Failed refreshes retain the last good snapshot for at most three TTLs, label it
  stale, retain the original timestamp, and retry background refresh after five
  minutes. Cold-cache failures also have a five-minute cooldown; manual refresh
  bypasses it. Unavailable accounts and missing daily coverage remain explicit. Totals
  with incomplete coverage are labeled known subtotals.
- Tab/service/search changes do not call AWS. Account and period changes read shared
  snapshots. Refresh live data explicitly bypasses the cache. Cost Explorer API
  requests, including paginated pulls, can incur AWS charges.
- AWS billing data can lag or remain estimated; an eight-hour refresh does not make
  Cost Explorer real-time. The UI preserves estimated qualifiers and excludes the
  current incomplete UTC day. No forecast or inferred savings is fabricated.
- Anomaly review compares seven completed days ending at the selected period’s end
  with the prior 28 days: minimum $25 impact and 50% increase, or a nonpositive baseline.
  Complete 35-day coverage is required. Findings name the account and service;
  they are observations, not AWS Cost Anomaly Detection alerts or causal proof.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `FINOPS_APP_PORT` | `3010` | Runtime HTTP port |
| `FINOPS_APP_BASE_PATH` | `/apps/finops` | Public mount |
| `FINOPS_AWS_ACCOUNT_LIST` | `AWS_ACCOUNT_LIST` | `profile:account_id` allowlist |
| `FINOPS_CROSS_ACCOUNT_ROLE_NAME` | `CROSS_ACCOUNT_ROLE_NAME`, then `read-only` | Scoped role to assume |
| `FINOPS_AWS_REGION` | `us-east-1` | Cost Explorer / STS region |
| `FINOPS_AWS_PARTITION` | `aws` | AWS ARN partition |
| `FINOPS_CACHE_TTL_SECONDS` | `28800` | Snapshot/background refresh interval; 60–86400 seconds |
| `FINOPS_BACKGROUND_REFRESH_ENABLED` | `true` | Disable only for isolated tests/previews |
| `FINOPS_AGENT_ID` | `agent-finops` | Existing caller-authorized investigation agent |
| `AWS_ROLE_ARN`, `AWS_WEB_IDENTITY_TOKEN_FILE` | Provider chain | Both required for IRSA |
| `AGENTIC_APP_TOKEN_SECRET` | Required by shared verifier | Host-issued app JWT verification |

Production needs its own FinOps service account and IRSA trust, projected STS token,
base-role permission to assume only the configured account roles, and read-only
`ce:GetCostAndUsage` / STS permissions. Reuse the existing workload-identity pattern;
never supply static keys or expand permissions from browser inputs. Without an
account list, local development can use the normal SDK provider chain (`AWS_PROFILE`)
and its verified account identity. The user-facing profile filter is only an
allowlist label, not an AWS profile selector.

## Build and validation

- Dedicated image: `build/Dockerfile.finops`; includes root MCP and app-local AWS SDK
  lockfiles. CI installs/audits the SDK and builds the image for the app matrix.
- Run `npm ci` at the repository root, `npm ci --prefix ui/apps/agentic-apps/finops`,
  then `npm test`, `npm run check`, and `npm run smoke`.
- `/health/ready` checks runtime readiness, not billing permission availability.
  `/api/costs` and `/api/cache-status` require `finops:read`; investigation preparation
  continues to require `finops:agent:invoke` and caller-authorized agent access.

AWS references: [GetCostAndUsage](https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_GetCostAndUsage.html)
for metric, pagination, grouping, and exclusive end dates;
[Cost Explorer data freshness](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-what-is.html).

## Terraform / GitOps source links

Configure repository URLs and source tag names with `INFRA_SOURCE_CONFIG` or
`INFRA_SOURCE_CONFIG_FILE`. See the [shared source-correlation guide](../../_lib/infrastructure-sources.md)
for configuration, tagging examples, cache behavior, permissions, and coverage limits.
Associations are tag-provided; they are not Terraform state verification.
