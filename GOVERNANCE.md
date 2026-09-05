# Governance

CAIPE Agentic Apps follows the community governance model maintained by the
[CAIPE project](https://github.com/caipe-io/governance).

## Maintainers

Repository maintainers are listed in [MAINTAINERS.md](MAINTAINERS.md). The
`.github/CODEOWNERS` file defines required review ownership for runtime,
contract, and release-automation changes.

## Decisions

Application behavior is governed by the CAIPE embedded-app contract. Changes
that affect mount paths, authorization scopes, agent bindings, MCP tools, or
secret handling require review of the runtime and its matching
`deploy/caipe` manifests.

## Security

Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
Security-sensitive changes should include regression coverage and must not put
credentials, raw API keys, or bearer tokens into browser responses, fixtures, or logs.
