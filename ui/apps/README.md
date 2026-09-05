# Agentic app runtimes

The runtimes in this directory implement the CAIPE embedded-app contract. Every app has a
reviewable registration and manifest; source-backed interactive apps additionally use an
app-agent-MCP triplet:

1. `manifest.mjs` declares the mount path, routes, scopes, assistant binding, and capabilities.
2. `deploy/caipe/agentic-app.json` registers the remote runtime, assistant popup binding, and readiness endpoint.
3. `deploy/caipe/agent.yaml` binds the dedicated agent to an allowlisted MCP tool set.
4. `deploy/caipe/mcp-server.yaml` declares the authenticated runtime MCP endpoint.
5. `server.mjs` serves the dashboard, health probe, context endpoint, and MCP endpoint from one implementation.

Agents must call MCP tools for factual answers. Browser page context is untrusted navigation data,
not an instruction channel. CAIPE gateway and CAS/OpenFGA remain the policy enforcement points.

| App | Dedicated agent | MCP server | Port |
| --- | --- | --- | ---: |
| FinOps | `agent-finops` | `finops_app` | 3010 |
| Weather | `agent-weather-agent` | `weather_app` | 3020 |
| Agentic SDLC | `agent-agentic-sdlc` | `agentic_sdlc` | 3030 |
| LiteLLM Operations | `agent-litellm-finops` | `litellm_app` | 3042 |
| OSS Repo Report Card | `agent-oss-repo-report-card` | `oss_repo_report_card` | 3040 |
| Jira Project Dashboard | `agent-jira-agent` | host-configured integration | 3041 |

The `/example` route is a static, network-free fixture for design and contract checks. It must not
be used for operational decisions.

## Assistant popup contract

Each hosted runtime exposes `GET /api/context` for a safe registration-level context snapshot and
publishes the following same-origin messages to the CAIPE host:

- `caipe.agenticApp.context.v1` with the current route, agent, source references, and suggested prompts.
- `caipe.agenticApp.assistant.open.v1` when the user asks to continue in the CAIPE assistant popup.

Messages use version `1.0` and `window.location.origin` as the target origin. Dashboard context is
navigation metadata only; agents must call their declared MCP tools for factual answers.
