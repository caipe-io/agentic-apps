# SecOps Review

A private, read-only dashboard for a deployment-configured AWS account and region, or GitHub repository. Select **Review AWS** or **Review GitHub** for a fresh snapshot. A user with access to the app can view every configured scope. The example package requires the host `admin` role by default; grant access only to people authorized for all configured data.

## Evidence and limitations

- EC2: identifies public IPv4/IPv6 interfaces with a security group permitting unrestricted ingress on TCP 22, plus unrestricted ingress on instances identified as development by `Environment`, `Env`, `Stage`, or `Name` tags. It does **not** evaluate internet gateways, route tables, ACLs, host firewalls, listeners, other AWS services, IPv6 global reachability, or actual exploitability. These are potential exposure signals, not confirmed reachability.
- Load balancers: lists internet-facing ALB/NLB/Gateway LB resources with matching development tags. It does not verify listeners, backend services, routes, or exposure. Untagged development resources are not identified.
- IAM: lists every IAM user in the chosen account, 25 per page. Three separate filters flag creation over 180 days ago, last *observed* console-password/access-key use over 180 days ago, and an active or inactive access key created over 180 days ago. Missing credential metadata or use history is unknown. These checks do not account for federated identities, role sessions, service-specific credentials, or all activity. A missing last-use date does not prove inactivity.
- GitHub: checks the configured repository's default branch for classic branch protection and active applicable repository/organization rulesets, plus secret scanning and push protection if GitHub returns those settings. Review counts, specific required checks, exemptions, bypass actors, inactive/evaluate rulesets, non-default branches, and alert contents are not assessed. Failed or incomplete reads are unknown.
- Signals are current configuration observations, not trend-based anomaly detection, AWS Security Hub findings, or a complete audit.

## Configuration

| Variable | Purpose |
| --- | --- |
| `SECOPS_AWS_ACCOUNT_LIST` | Comma-separated `profile:12-digit-account-id` allowlist. Empty disables AWS review. |
| `SECOPS_AWS_REGIONS` | Comma-separated AWS region allowlist. Empty disables AWS review. |
| `SECOPS_CROSS_ACCOUNT_ROLE_NAME` | Read-only role assumed in each configured account; default `read-only`. |
| `SECOPS_AWS_PARTITION` | `aws`, `aws-us-gov`, or `aws-cn`; default `aws`. |
| `SECOPS_GITHUB_REPOS` | Comma-separated exact `owner/repository` allowlist. Empty disables GitHub review. |
| `SECOPS_GITHUB_TOKEN` | Server-side read-only credential scoped to the configured repositories. Never sent to the browser. |
| `SECOPS_GITHUB_API_URL` | GitHub API base URL; defaults to `https://api.github.com`. Use HTTPS for enterprise. |
| `SECOPS_AGENT_ID` | Host assistant binding; defaults to `agent-secops`. Install and authorize the agent separately. |
| `SECOPS_AWS_AGENT_ID`, `SECOPS_GITHUB_AGENT_ID` | Existing agents for explicit investigations. GitHub defaults to `agent-github-agent`; set it to an empty value to disable GitHub Agent actions, or override it for another installation. AWS Agent actions require an explicit ID. The agent must be installed and accessible to the caller. GitHub permissions chat remains available after a failed or partial review, opening a conversation with the selected repository and a limited evidence summary. |
| `SECOPS_APP_PORT`, `SECOPS_APP_BASE_PATH` | Runtime port and mount path; defaults 3045 and `/apps/secops`. |

The workload role needs STS `GetCallerIdentity` and permission to assume the configured cross-account role. That role needs the minimum read permissions for EC2 `DescribeInstances` and `DescribeSecurityGroups`, Elastic Load Balancing `DescribeLoadBalancers` and `DescribeTags`, and IAM `ListUsers`, `ListAccessKeys`, and `GetAccessKeyLastUsed`. Missing IAM key permissions produce unknown key values; missing network or load-balancer permissions produce unavailable coverage. IAM key enrichment makes multiple calls per user and can take time on large accounts. Concurrent requests for the same scope share a scan. No access keys or credentials are returned to the browser.

The GitHub token needs repository visibility and permissions for branch protection, applicable rules, and security settings. Access differs by GitHub deployment and token type; insufficient access yields partial or unknown results. The token belongs to the workload, **not** the signed-in user: the deployment must restrict both repository scope and app access to the appropriate audience.

Use the example v2 host package in `deploy/caipe/manifest-v2.yaml`, the private registration in `agentic-app.json`, and `agent.yaml` as a starting point. The host must issue app-scoped tokens, protect `/apps/secops` with appropriate authorization, and bind the assistant and configured AWS/GitHub agents to their own approved MCP tools. Creating roles, granting app access, installing agent bindings, and deploying secrets are separate operator-controlled steps; this app never grants permissions or changes source resources.

References: [GitHub rules for a branch](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch), [GitHub branch protection](https://docs.github.com/en/rest/branches/branch-protection), and [AWS EC2 reachability](https://docs.aws.amazon.com/securityhub/latest/userguide/exposure-ec2-instance.html).

SecOps restricts every assumed account session to the eight read operations needed for its scan. The session policy is an additional restriction on the target role; it cannot grant new permissions. Other applications retain their existing credential behavior.
