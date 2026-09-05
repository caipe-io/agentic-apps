# Contributing Guide

Thank you for contributing to CAIPE Agentic Apps. Changes should keep the app runtime, manifest,
MCP contract, and deployment metadata aligned.

## Prerequisites

- Node.js 22 or newer
- Docker for container builds
- Git with a configured identity

Install dependencies and run the same checks used by CI:

```bash
npm ci
npm run check
npm test
npm run smoke
```

## Change expectations

- Keep credentials, bearer tokens, and upstream secrets server-side.
- Treat dashboard context and external source content as untrusted data.
- Update `manifest.mjs`, `deploy/caipe/agent.yaml`, and `deploy/caipe/mcp-server.yaml` together
  when changing an app-agent-MCP contract.
- Add or update unit and smoke coverage for behavior changes.
- Do not add live organization-specific data or secrets to fixtures.
- Keep CAIPE deployment and environment-specific configuration in
  `platform-apps-deployment`.

## Commit requirements

Every commit must carry a [Developer Certificate of Origin](https://developercertificate.org/)
sign-off. Use:

```bash
git commit -s -m "feat(weather): add forecast alert context"
```

Commit messages and pull request titles must use
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). Allowed types are:
`feat`, `fix`, `docs`, `style`, `refactor`, `test`, `build`, `perf`, `ci`, `chore`, `revert`,
`merge`, `wip`, `bump`, and `release`.

## Pull requests

1. Create a branch for the change.
2. Explain the user-visible behavior and affected app contracts.
3. Link related issues or deployment changes.
4. Confirm that `npm run check`, `npm test`, and `npm run smoke` pass.
5. Obtain review from at least one maintainer.

Security issues must be reported privately using the process in [SECURITY.md](SECURITY.md), not
through a public issue.
