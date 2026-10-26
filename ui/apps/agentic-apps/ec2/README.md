# EC2 Instances Dashboard

- Route: `/apps/ec2`; port: `3043`; dedicated agent: `agent-ec2`.
- Inventory uses the server-side AWS SDK v3 with complete service pagination.
- Questions and anomaly investigations use the existing `mcp-aws` / `aws_cli_execute` agent.
- Reuses the canonical app JWT, authorization, iframe context bridge, and authorized
  conversation creation plus `/api/v1/chat/invoke` flow. AWS credentials stay on the server.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `EC2_APP_PORT` | `3043` | Runtime port |
| `EC2_APP_BASE_PATH` | `/apps/ec2` | Hosted mount |
| `EC2_AGENT_ID` | `agent-ec2` | Must match the host app's agent binding |
| `EC2_AWS_ACCOUNT_LIST` | `AWS_ACCOUNT_LIST` | Canonical `profile:account_id` pairs matching AWS MCP |
| `EC2_AWS_REGIONS` | `AWS_REGION`, `AWS_DEFAULT_REGION`, then `us-east-1` | Comma-separated permitted regions |
| `EC2_CROSS_ACCOUNT_ROLE_NAME` | `CROSS_ACCOUNT_ROLE_NAME`, then `read-only` | Role assumed in each configured account |
| `EC2_OWNER_TAG_KEYS` | `Owner,ResourceOwner,User,Username,CreatedBy,Email` | Tag keys used for owner/user filtering and display; up to 16 keys |
| `EC2_AWS_PARTITION` | `aws` | AWS ARN partition |
| `EC2_CACHE_TTL_SECONDS` | `28800` | Fresh snapshot lifetime and background refresh interval; 60–86400 seconds |
| `EC2_BACKGROUND_REFRESH_ENABLED` | `true` | Warm all configured scopes at startup and refresh on schedule; disable only for isolated previews |
| `AWS_ROLE_ARN`, `AWS_WEB_IDENTITY_TOKEN_FILE` | AWS provider chain | Configure both for IRSA |
| `AGENTIC_APP_TOKEN_SECRET` | Required by shared verifier | Host-issued app JWT verification |

- The landing page automatically loads all configured accounts and regions. Account
  and region filters immediately apply cached views within these allowlists. Each configured account is reached through its read-only
  role using server credentials. Profile names are labels, never local AWS profile selectors.
- Without an account list, the server uses its default AWS credential provider chain
  and verifies the resulting identity through STS. Local development can use `AWS_PROFILE`.
- Production should use IRSA: an exact service-account trust, projected STS audience
  token, and a base role permitted to assume only the configured read-only roles.
  Both IRSA variables must be present; partial IRSA configuration fails at startup.
- The signed app JWT requires `ec2:read` for inventory and `ec2:agent:invoke` for
  investigations. All authorized app readers see the deployment-configured AWS scope.
  The cache is shared under this workload identity; it does not accept user credentials
  or arbitrary browser-supplied role ARNs. IAM remains the AWS access boundary.
- Deploy the runtime, import `deploy/caipe/agentic-app.json`, and configure the agent
  using `agent.yaml`. Reuse the organization-owned AWS MCP endpoint for investigations.
- Deployment-specific identities and branding belong in deployment configuration.

## Search and links

- Search names, instance IDs, profile/account/region, size, OS, and every tag key/value.
  Case, spaces, hyphens, and underscores match consistently. Filtering loaded records
  does not call AWS. Choose All fields, Name or instance ID, or Tags. Tag expressions
  such as `Owner=example-team` match the complete normalized key and a partial value;
  `Owner=` finds instances with that key. “Search all accounts & regions” searches
  every configured scope. Search mode is preserved with `searchIn=name` or `searchIn=tags`.
- `?profile=primary&region=us-east-1&search=simulation` loads that search automatically.
- `?profile=primary&region=us-east-1&instanceId=i-0123456789abcdef0` directly describes
  the instance and opens its details without loading earlier service pages.
- Search or instance links without a scope use all configured accounts/regions.
  Invalid IDs or unconfigured scopes show an error. Recipients need their own app access.
- Instance labels prefer the AWS `Name` tag, then `ApplicationName`; absent names
  display as “Unnamed instance”. Names lead the inventory, GPU list, details, and
  review/investigation headings. IDs remain secondary for disambiguation. Named
  investigation links use the verified account/region/ID to open the correct instance;
  shared links keep stable IDs because names can repeat or change.
- “Copy link” shares the selected instance, or the active search/view when none is selected.

## Filters and sorting

- Combine hardware/state, exact instance type, AWS size suffix, owner/user, tag presence,
  independent tag key/value expressions, and minimum/maximum modeled monthly USD cost.
- Owner/user values come from configurable tags, not verified AWS creator identities.
  Key aliases ignore case/separators; owner values preserve punctuation and ignore case.
  “No owner tag” requires a complete tag list. Ownership is shown in inventory/details.
- Cost ranges exclude unknown estimates. Invalid or inverted ranges show no results
  and an error. Type/size/owner choices come from the full cached population, remain
  selected during partial loads, and do not silently broaden unavailable URL selections.
- Sort by type, vCPU/RAM size (largest/smallest), memory, estimated cost (high/low),
  owner/user, tag count (fewest/most), tag keys/values, name, or launch date. Unknown
  hardware/cost/owner values sort after known values. Filters apply across all tabs.
- Copy link preserves `type`, `size`, `owner`, `tags`, `tagStatus`, `minCost`, `maxCost`,
  `sort`, and anomaly `signal`/`highCost` settings. “Clear filters” keeps the account/region
  scope and anomaly thresholds while clearing inventory filters and the signal category.

## Views

- **Search** is the first/default tab: one search box for names, instance IDs, owners,
  and tags across all configured accounts and regions. Cached inventory loads in the
  background; no instance is selected automatically. Search shows up to 12 named
  results, with a link to view all matches in inventory. Selecting a result opens its
  details. Search ignores inventory filters; returning to Search restores the fleet
  scope. Share a search with `tab=search&search=example`.
- Clicking a tab, or navigating with arrow keys, reloads its account/region snapshot
  from the shared cache and shows loading status. It does not force a fresh AWS scan
  or automatically start an agent investigation. The URL reflects the active tab.
  The selected panel scrolls into view after loading, with the tab bar kept visible.
  Instance-ID searches stay in the requested view when its cached data reloads.
- **Instances** is the second tab and uses all configured account/region
  snapshots. Account/region changes apply immediately; search/filter the cached fleet
  and inspect its instances without a manual initial load.
- **GPU instances** is the third tab, using the same cached inventory, search, state,
  sort, pagination, details, and account/region scope. Only verified GPU hosts appear;
  unknown GPU metadata is excluded with a visible count. The general hardware filter
  is preserved when returning to other tabs. Share the GPU view with `tab=gpu`.
- **Analytics** is the fourth tab (`tab=analytics`; existing `tab=overview` links
  remain supported). Instance-type, CPU-platform, and GPU-presence pie
  charts share the selected account/region scope and visible search/state/hardware filters.
- CPU groups distinguish x86, verified Graviton, other Arm, unverified Arm, and
  other/unknown architecture. Arm alone does not prove Graviton (for example, Arm Mac).
- GPU presence is a separate dimension: GPU instances can use x86 or Graviton CPUs.
  Unknown GPU metadata remains a separate pie slice. No GPU is established only by
  a successful DescribeInstanceTypes result without GPU metadata. Any reported GPU
  entry or positive GPU memory counts as GPU enabled, including fractional/vGPU devices.
- Hardware filters let the instance list show x86, Graviton, other Arm, GPU-enabled,
  no-GPU, or unknown-hardware records. Shared links preserve the active tab and filters.
- Type pies show the six largest types plus Other types; all records remain in the table.

- **Cost overview** is the fifth tab, showing state-aware reference cost estimates,
  pricing coverage, account/type breakdowns, and the highest-cost named instances.

## Anomalies

- The sixth tab shows configurable snapshot review signals: high monthly on-demand
  reference cost, stopped instances with older launch dates, and missing required tags.
- Untagged instances have an explicit signal even when no required tag keys are set.
  The complete tag list must be empty; truncated/unknown tags do not prove absence.
  Nonempty lists missing required keys are a separate category. Select High estimated
  cost, Without tags, Missing required tags, Older stopped, or All signals; the agent
  investigates the visible category. Cost remains a configurable reference threshold.
- Signals use the same loaded account/region population and filters as the other views.
  Incomplete pricing, dates, tags, and AWS pages remain visible coverage gaps. Missing
  tags are flagged only from a complete reported tag list; tag key matching is exact.
- An explicit investigation sends at most five highest-ranked instances through the
  dedicated AWS agent, with at most two account/region requests in flight. The agent
  verifies STS and current EC2 inventory, then reads CloudWatch CPU Average/Maximum
  for the last seven completed UTC days. Request phases, elapsed time, and cancel remain visible.
- Results separate observations, unconfirmed hypotheses, and next checks. CPU sample
  coverage and agent-cited commands are inspectable. Fewer than five reported days
  are insufficient for a utilization conclusion; missing metrics are never zero.
- These are review signals, not statistical billing anomalies. Launch age is not time
  spent stopped. Low CPU alone does not prove idleness or that stopping is safe.
  Actual billing spikes and savings require separate billing and workload evidence.
- Changing inventory, filters, or thresholds clears the previous investigation.

## Data and cost definitions

- Inventory grain: verified AWS account + region + instance ID.
- The SDK follows every DescribeInstances token, deduplicating instance IDs and
  verifying reservation ownership against STS. Two scope reads run concurrently.
  A bounded batch stops at 200 pages or 10,000 rows; remaining tokens and failures
  stay visible with a continuation action. Local table pagination never limits inventory.
- Counts, size/OS charts, filters, and cost totals use the same loaded population.
  Unavailable scopes, pending pages, and price coverage are visible. No full-fleet
  count or empty-account conclusion is inferred from incomplete data.
- Size comes from EC2 instance type. vCPU/RAM, CPU manufacturer, and GPU presence
  come from DescribeInstanceTypes.
- Platform is EC2 PlatformDetails. Exact OS name/version requires SSM evidence;
  missing SSM access never creates an inferred Linux distribution.
- DescribeInstances returns the complete tag list, including tags beyond the table
  preview. Tags/names are escaped as text and never interpreted as agent instructions.
- Hourly rates require a unique AWS Price List match for region, type, OS, shared
  tenancy, and hourly unit. Up to 100 distinct type/OS combinations are enriched per
  batch. Missing, denied, truncated, or ambiguous prices remain unknown.
- Estimated monthly on-demand equivalent = hourly USD rate × 730 hours for each
  running instance. Missing running-instance prices are excluded with visible coverage.
  Stopped/terminated instances have zero modeled compute runtime; their storage and
  other charges continue to be excluded. Other transitional states remain unknown.
- The Cost overview tab includes known compute subtotals per hour, 24-hour day, and 730-hour
  modeled month, priced-running coverage, account/type cost breakdowns, and the ten
  highest modeled running-instance costs with named links. Unknown rates are excluded
  and counted; partially priced groups are never presented as complete spend.
- Instance details show the reference hourly rate and state-aware daily/monthly compute
  estimates. Stopped/terminated compute is modeled as zero; storage remains excluded.
- These are reference prices, **not actual billed costs**. Spot, RI/Savings Plans,
  EBS, networking, tax, and additional license charges are not modeled. Ask AWS can
  investigate billing separately when billing data and permissions are available.
- Server snapshots are refreshed every eight hours by default, including complete tags and
  metadata. Cache keys include scope, continuation token, and direct instance ID.
  Concurrent identical reads share one job; canceling a browser does not cancel it
  for other readers. Snapshot storage is bounded to 64 MiB with oldest-use eviction;
  metadata has a separate 2,048-entry bound. A startup job warms every configured
  account/region scope with at most two concurrent reads and follows continuation
  batches automatically. Process restarts clear the in-memory cache and start a new warm-up.
- Background refreshes do not overlap. Failed cycles retry after five minutes (or the
  configured interval if shorter). Existing snapshots remain readable during refresh
  until a maximum source age of three refresh intervals (24 hours by default), explicitly marked
  stale. Failures preserve prior snapshots; unavailable/partial scopes remain visible.
  `/api/cache-status` exposes progress and scheduling behind normal app read authorization.
- Direct instance lookups reuse a matching cached fleet snapshot when available,
  including verified absence from complete cached coverage. Forced refresh bypasses it.
- Upgrade deployments that explicitly set the old four-hour value to
  `EC2_CACHE_TTL_SECONDS=28800` to use the requested eight-hour schedule.
- Cache age uses the oldest source lookup. “Refresh live data” bypasses both snapshot
  and metadata caches. Snapshot times, cache hits, expiry, and partial coverage are visible.
  Shared links contain scope/filters, never inventory or credentials.
- The runtime does not synthesize production fixture rows or fall back to mock data.

## Source references

- [EC2 DescribeInstances](https://docs.aws.amazon.com/cli/latest/reference/ec2/describe-instances.html)
- [CloudWatch GetMetricStatistics](https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_GetMetricStatistics.html)
- [AWS Price List API](https://docs.aws.amazon.com/cli/latest/reference/pricing/)
- [SSM instance OS information](https://docs.aws.amazon.com/systems-manager/latest/userguide/example_ssm_DescribeInstanceInformation_section.html)

## Operational behavior

- Loading shows a spinner, elapsed time, completed scopes, and cache status. AWS SDK
  inventory reads do not invoke an agent. Metadata failures preserve verified instance
  records and show warnings instead of inventing hardware, OS, or rates.
- Investigations show actual request phases; the invoke endpoint does not stream
  tool-level progress. Cancel stops waiting in the browser; server work may continue.
- Investigation prompts include the complete response schema and structured-response
  metadata for deployed runtimes that return final JSON. Client validation rejects
  mismatched scope, identity, evidence, metric windows, and malformed findings.
- Agent-reported evidence is not a signed attestation. The dedicated agent and MCP
  policies must be installed. Missing agent/MCP access produces an unavailable state.


## Optional confirmed instance stop

Stop is disabled by default. It depends on
[caipe-io/ai-platform-engineering#3039](https://github.com/caipe-io/ai-platform-engineering/pull/3039)
or a compatible AWS MCP release with identity-tagged, IAM-scoped writes.

- Set EC2_STOP_ENABLED=true, EC2_STOP_PROFILES to explicit configured profiles,
  and EC2_STOP_ALLOWED_SUBJECTS to explicit stable authenticated subject IDs.
  Do not use display names or browser-supplied identities.
- Enable the manifest's exact POST /api/stop-request policy only for the intended
  deployment. Its default effect is deny; it requires a signed ec2:stop scope.
  The runtime additionally enforces its subject/profile allowlists for every phase.
  Keep the two review-request POST routes declared when applying route policies.
- EC2_STOP_AGENT_ID defaults to the existing EC2 agent. Install the updated agent
  instructions before enabling the action. Inventory/anomaly investigations stay
  read-only; the permitted write is an explicitly confirmed, normal one-instance stop.
- AWS MCP must validate the caller's OAuth2 token, enable only
  AWS_ALLOWED_WRITE_COMMANDS=ec2.stop-instances, and pass a verified configured
  identity claim as an STS session tag. IAM must allow the intended role assumption,
  session tag, and ec2:StopInstances resources/ownership conditions.
  App scopes and UI visibility do not replace IAM authorization. Do not broaden the
  dashboard inventory credentials or enable generic writes for this feature.
- The Stop button appears in running-instance details only for eligible callers and
  profiles. The runtime reads live instance state before displaying confirmation,
  then checks it again before issuing the caller-bound execution plan.
- Confirmation displays the verified name, instance ID, account/profile, region, and
  type. The user types the exact instance ID. Approvals expire after two minutes and
  can be consumed once, including concurrent confirmations.
- Execution uses the existing caller-authorized agent/MCP bridge; the dashboard's
  SDK role does not stop instances. The plan contains one exact normal stop command.
  Force, skip-OS-shutdown, termination, restart, multi-instance actions, and automatic
  stop retries are excluded. The agent response must match the approved scope and
  cite identity, inventory, and the exact stop command.
- Acceptance and final stopped state are separate. Live SDK reads verify state;
  polling is bounded to about one minute, with a read-only Check live status action
  afterward. Errors and ambiguous outcomes remain visible without resubmitting a stop.
- Live status checks invalidate the affected fleet/direct snapshot scope. Older
  in-flight reads cannot put pre-stop state back into the shared cache.
- Validate mutations using mocked inventory/MCP responses. Do not stop a live
  instance as a smoke test; that requires an explicit operation request.
