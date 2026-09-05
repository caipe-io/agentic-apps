# Agentic app runtimes

The runtimes in this directory implement the CAIPE embedded-app contract. Source-backed
interactive apps use a reviewable app-agent-MCP triplet:

1. `manifest.mjs` declares the mount path, routes, scopes, assistant binding, and capabilities.
2. `deploy/caipe/agent.yaml` binds the dedicated agent to an allowlisted MCP tool set.
3. `deploy/caipe/mcp-server.yaml` declares the authenticated runtime MCP endpoint.
4. `server.mjs` serves the dashboard, health probe, and MCP endpoint from one implementation.

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
| Speakers Collective | `agent-speakers-collective` | host-configured integration | 3043 |

The `/example` route is a static, network-free fixture for design and contract checks. It must not
be used for operational decisions.
