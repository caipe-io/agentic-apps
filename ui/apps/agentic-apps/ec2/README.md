# EC2 Instances Dashboard

- Route: `/apps/ec2`; port: `3043`; dedicated agent: `agent-ec2`.
- Inventory and questions use the existing `mcp-aws` / `aws_cli_execute` integration.
- Reuses the canonical app JWT, authorization, iframe context bridge, and authorized
  conversation creation plus `/api/v1/chat/invoke` flow. AWS credentials stay in MCP.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `EC2_APP_PORT` | `3043` | Runtime port |
| `EC2_APP_BASE_PATH` | `/apps/ec2` | Hosted mount |
| `EC2_AGENT_ID` | `agent-ec2` | Must match the host app's agent binding |
| `EC2_AWS_ACCOUNT_LIST` | `AWS_ACCOUNT_LIST` | Canonical `profile:account_id` pairs matching AWS MCP |
| `EC2_AWS_REGIONS` | `AWS_REGION`, `AWS_DEFAULT_REGION`, then `us-east-1` | Comma-separated permitted regions |
| `AGENTIC_APP_TOKEN_SECRET` | Required by shared verifier | Host-issued app JWT verification |

- Multiple accounts require an explicit selection. “All configured” remains bounded
  to these allowlists. With no account list, the agent verifies the MCP default AWS
  identity using STS; no local developer credentials are read by this runtime.
- Profile configuration limits the dashboard's request builder. The host's app/agent
  authorization and AWS MCP IAM policies remain the access-control boundaries.
- Deploy the runtime, import `deploy/caipe/agentic-app.json`, and configure the agent
  using `agent.yaml`. Reuse the existing `mcp-aws` registration; do not replace its
  organization-owned endpoint or credentials with the generic example.
- Deployment-specific account identities and branding belong in deployment config.

## Data and cost definitions

- Inventory grain: verified AWS account + region + instance ID.
- One AWS service page per agent request, at most ten instances; reads run at most
  two account/region scopes concurrently. “Load next AWS pages” preserves service
  pagination tokens. Tables also paginate/filter the loaded records locally.
- Counts, size/OS charts, filters, and cost totals use the same loaded population.
  Unavailable scopes, pending pages, and price coverage are visible. No full-fleet
  count or empty-account conclusion is inferred from incomplete data.
- Size comes from EC2 instance type. vCPU/RAM come from DescribeInstanceTypes.
- Platform is EC2 PlatformDetails. Exact OS name/version requires SSM evidence;
  missing SSM access never creates an inferred Linux distribution.
- Initial inventory includes three tag previews and the reported tag count.
  “Load all tags” retrieves one selected instance through AWS MCP. Tags/names are
  escaped as text and must never be interpreted as agent instructions.
- Hourly rates require AWS Price List evidence matching region, type, OS, shared
  tenancy, and hourly unit. At most three price combinations are enriched per page.
  Missing or ambiguous rates remain unknown.
- Estimated monthly on-demand equivalent = hourly USD rate × 730 hours for each
  running instance. Missing running-instance prices are excluded with visible coverage.
  Stopped/terminated instances have zero modeled compute runtime; their storage and
  other charges continue to be excluded. Other transitional states remain unknown.
- These are reference prices, **not actual billed costs**. Spot, RI/Savings Plans,
  EBS, networking, tax, and additional license charges are not modeled. Ask AWS can
  investigate billing separately when billing data and permissions are available.
- Results stay in the browser for the current view; filters do not refetch. Refresh
  starts a new inventory snapshot. Shared links contain scope/filters, not data.
- The runtime does not synthesize production fixture rows or fall back to mock data.

## Source references

- [EC2 DescribeInstances](https://docs.aws.amazon.com/cli/latest/reference/ec2/describe-instances.html)
- [AWS Price List API](https://docs.aws.amazon.com/cli/latest/reference/pricing/)
- [SSM instance OS information](https://docs.aws.amazon.com/systems-manager/latest/userguide/example_ssm_DescribeInstanceInformation_section.html)

## Operational behavior

- Loading shows elapsed time and actual request phases; the invoke endpoint does
  not stream tool-level progress. Cancel aborts browser requests; agent work already
  started on the server may continue.
- STS, scope, bounded rows/tags, price matching, pagination, response format, and
  evidence are validated before rendering. Agent-reported evidence is not a signed
  attestation of execution; the dedicated agent and MCP policies must be installed.
- Missing host agent or AWS MCP connectivity produces an explicit unavailable state.
