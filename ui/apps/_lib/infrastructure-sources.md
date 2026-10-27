# Infrastructure source correlation

EC2 and FinOps share a deployment-configured repository allowlist and tag mapping.
All associations are **tag-provided**. They do not establish Terraform state ownership,
code drift, or which person created a resource. Missing evidence means **Source unknown**.

## Configuration

Set `INFRA_SOURCE_CONFIG` to JSON, or mount a read-only JSON file and set
`INFRA_SOURCE_CONFIG_FILE`. A file takes precedence. The configuration is limited to
64 KiB and 64 repositories. No repositories are enabled by default.

```json
{
  "repositories": [
    {
      "id": "example-infra",
      "url": "https://git.example.com/example/infrastructure",
      "ref": "main"
    }
  ],
  "tagKeys": {
    "repository": ["Repository", "git:repository"],
    "path": ["TerraformPath", "git:path"],
    "ref": ["GitRef", "git:ref"],
    "workspace": ["TerraformWorkspace", "terraform:workspace"],
    "address": ["TerraformResource", "terraform:resource"],
    "owner": ["Owner", "Team"],
    "managedBy": ["ManagedBy"]
  }
}
```

- Repositories must use HTTPS GitHub-compatible URLs, including private/enterprise
  hosts. Tags can select a configured ID, `owner/repository`, or exact repository URL.
- Unspecified tag-key categories retain their defaults in `infrastructure-sources.mjs`.
  Matching tag keys is case-sensitive. Conflicting metadata produces Source unknown.
- A repository tag is required. `ManagedBy=terraform` alone is insufficient.
- Paths must be repository-relative; optional path/ref/workspace/address tags are
  displayed with their exact evidence. Missing paths link to the repository tree.
- Prefer an applied commit SHA in `GitRef` when CI can provide it. A branch default
  links to the current branch, not necessarily the code used for the deployment.
- Repository access still follows the user's Git provider permissions. Raw Terraform
  state, Git credentials, and arbitrary tag-provided external URLs are never exposed.
- Put deployment-specific repository URLs and tag mappings in deployment configuration.
  Restart the app after changing this configuration.

Example Terraform resource tags:

```hcl
tags = {
  Repository         = "example-infra"
  TerraformPath      = "environments/dev/main.tf"
  GitRef             = var.git_commit
  TerraformWorkspace = terraform.workspace
  TerraformResource  = "module.worker.aws_instance.main"
  Owner              = "example-team"
  ManagedBy          = "terraform"
}
```

For instances created by Auto Scaling or a node group, propagate source tags from the
owning configuration. The link can identify that module; it is not a verified mapping
of an individual instance to an `aws_instance` resource.

## EC2

- Instance details contain **Infrastructure source**, **View code**, evidence, and
  **Ask about source**. The selected association is included in assistant context.
- Correlation uses the complete tags already stored in the eight-hour EC2 cache.
  Opening details or rendering a source link makes no additional AWS/Git calls.
- Existing `ec2:read` authorization applies. The UI does not read Terraform backends,
  change tags, or apply infrastructure.

## FinOps

- EC2 resource cards link to the corresponding account/region/instance dashboard.
  Recipients still need their own EC2 app access.
- Services has **View sources** and a searchable, paginated **Infrastructure sources**
  panel. Cost anomaly cards can open the associated account/service source view.
- `GET /api/infrastructure-sources` uses existing `finops:read` authorization and
  validates profiles against the configured account allowlist.
- Set `FINOPS_SOURCE_REGIONS` to a comma-separated list (up to eight). The default is
  `AWS_REGION`, or `us-east-1`. The current role needs `tag:GetResources` and
  `sts:GetCallerIdentity` in addition to its existing assume-role permissions.
- Resource Groups Tagging API queries each configured repository tag key separately,
  matching any key (OR semantics), and deduplicates resources across keys. Reads follow
  every matching page, verify account identity,
  validate resource ARNs, and cache sanitized records. At most two scopes run at once.
  The cache is bounded to 64 MiB and 50,000 resources/500 pages per scope. A failed or
  truncated read never publishes a partial replacement snapshot.
- Discovery warms at startup and refreshes at the configured FinOps cache interval
  (eight hours by default). Warm reads return cached data during refresh; failures retry
  after five minutes. Stale data is labeled and retained for at most three intervals.
  Process restarts warm the in-memory cache again. Refresh source tags bypasses cache.
- Account, service, resource search, and local pagination reuse the same index.
  Disabled correlation makes no discovery calls. Coverage shows unavailable/stale scopes.
- The index contains supported resources carrying at least one configured repository
  tag key. This avoids scanning unrelated tagged infrastructure in large accounts.
  It cannot establish that resources without source tags, untagged resources, or
  unsupported resources are absent or unmanaged.
- Service filters use known ARN service-family mappings. Unknown AWS services appear
  under All services; mappings are not exhaustive. `rds` ARNs cannot establish the
  database engine, so Neptune Database resources may require the unfiltered view.
- These are **current resource/source associations**, independent of the historical
  cost period. Costs remain aggregated by billing service/account. No resource-level
  cost, historical ownership, or cause of an anomaly is inferred from these tags.
