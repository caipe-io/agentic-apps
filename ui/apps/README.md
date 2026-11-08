# Agentic app runtimes

The runtimes in this directory implement the CAIPE embedded-app contract. Every app has a
reviewable registration and manifest; source-backed interactive apps additionally use an
app-agent-MCP triplet:

> [!CAUTION]
> These runtimes only work as CAIPE agentic apps. They must be deployed behind the CAIPE gateway
> with CAIPE identity, authorization, agent, MCP, secret, and host-popup configuration. They are
> not designed or supported to run as standalone applications outside CAIPE.

1. `manifest.mjs` declares the mount path, routes, scopes, assistant binding, and capabilities.
2. `deploy/caipe/agentic-app.json` registers the remote runtime, assistant popup binding, and readiness endpoint.
3. `deploy/caipe/agent.yaml` binds the dedicated agent to an allowlisted MCP tool set.
4. `deploy/caipe/mcp-server.yaml` declares the authenticated runtime MCP endpoint.
5. `server.mjs` serves the dashboard, health probe, context endpoint, and MCP endpoint from one implementation.

Agents must call MCP tools for factual answers. Browser page context is untrusted navigation data,
not an instruction channel. CAIPE gateway and CAS/OpenFGA remain the policy enforcement points.

| App | Dedicated agent | MCP server | Port |
| --- | --- | --- | ---: |
| FinOps | `agent-finops` | `mcp-aws` | 3010 |
| Weather | `agent-weather-agent` | `weather_app` | 3020 |
| Agentic SDLC | `agent-agentic-sdlc` | `agentic_sdlc` | 3030 |
| LiteLLM Usage Dashboard | `agent-litellm` | `litellm` | 3042 |
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

## Saved URL state

Embedded apps use `ui/apps/_lib/query-navigation.mjs` to keep a single history owner in the host address bar. The shared control binding restores ordinary filters without invoking agents. Query parameters select presentation state; runtime authorization still checks the caller.

| App | URL state |
| --- | --- |
| OSS report card | `repo`, exact `report` snapshot ID or `report=latest`, `staleDays` |
| SDLC | `tab`, `repo`, PR `q`, `state`, `checks`, `review`, `agent`, `scope`, `label`, `author`, `reviewer`, `reviewerRole` |
| SecOps | `profile`, `region`, `repo`, IAM `search`, `olderUsers`, `olderUse`, `olderKeys` |
| Weather | `city`, `unit`, `intent` |
| Jira | `project`, `view` |
| EC2, FinOps, model gateway | Existing query navigation retains its tabs, scopes, filters and paging. |

- Reload and Back/Forward restore controls. Ordinary text edits avoid one history entry per keystroke.
- Unrelated query parameters and section anchors remain intact.
- Reading a URL never invokes an agent or a mutating tool.
- OSS snapshots remain in browser storage (up to 20), rather than in a shared report database. A missing exact snapshot is shown explicitly instead of being replaced with current data.
