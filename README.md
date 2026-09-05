# CAIPE Agentic Apps

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)

Standalone, source-backed application runtimes for the [CAIPE](https://github.com/caipe-io/ai-platform-engineering) platform.
The source-backed runtimes serve their dashboard, readiness and liveness endpoints, context endpoint,
and app-scoped MCP endpoint;
Jira Project Dashboard currently uses a host-configured agent integration and is included here so
the runtime image has one source boundary. CAIPE deployment configuration
remains in the separate `platform-apps-deployment` repository.

## Included applications

| Application | Mount path | Port | Dedicated agent | Purpose |
| --- | --- | ---: | --- | --- |
| FinOps Command Center | `/apps/finops` | 3010 | `agent-finops` | AWS and LiteLLM cost/usage workflows |
| Weather Lab | `/apps/weather` | 3020 | `agent-weather-agent` | Open-Meteo forecast and air-quality data |
| Agentic SDLC | `/apps/agentic-sdlc` | 3030 | `agent-agentic-sdlc` | Repository delivery and ship-loop workflows |
| LiteLLM Operations | `/apps/litellm` | 3042 | `agent-litellm-finops` | LiteLLM usage, spend, model, and key operations |
| OSS Repo Report Card | `/apps/oss-repo-management` | 3040 | `agent-oss-repo-report-card` | Repository health and OSS readiness evidence |
| Jira Project Dashboard | `/apps/jira-project-dashboard` | 3041 | `agent-jira-agent` | Jira project and delivery metrics |

The source-backed applications follow the CAIPE app-agent-MCP triplet:

```text
Signed-in user -> CAIPE app gateway -> app runtime -> dedicated agent -> app MCP -> source system
```

Dashboard context is untrusted navigation context. Agents must call the declared MCP tools for
factual answers. Runtime tokens and upstream credentials stay server-side.

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

## Container image

The CI workflow publishes `ghcr.io/caipe-io/agentic-apps-runtime` from release tags beginning
with `agentic-apps-`. The image contains the shared runtime libraries and all six application
servers; deployment selects the server command and port.

## LiteLLM data handling

LiteLLM requests are made by the server-side runtime or the authorized LiteLLM MCP server. The
dashboard and assistant may report data for available virtual keys, including safe key identifiers,
owners, budgets, spend, token counts, requests, and model activity, but must never expose raw key
material, bearer tokens, or other credentials. Access remains subject to CAIPE identity and policy.

## Governance

See [CONTRIBUTING.md](CONTRIBUTING.md), [MAINTAINERS.md](MAINTAINERS.md), [SECURITY.md](SECURITY.md),
and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). This repository follows CAIPE’s Apache-2.0 licensing,
DCO sign-off, and Conventional Commit requirements.
