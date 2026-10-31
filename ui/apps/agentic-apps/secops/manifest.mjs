export const SECOPS_MANIFEST = {
  id: "secops", displayName: "SecOps Review", description: "Read-only AWS exposure, IAM-user and GitHub repository-control review.", apiVersion: "1.0",
  runtime: { kind: "proxied-next-zone", mountPath: "/apps/secops", chrome: "iframe" },
  ui: { contractVersion: "1.0", surface: "hosted", routes: ["/"] },
  authorization: { resourceType: "agentic_app", launchAction: "use" },
  surfaces: { showInHub: true, showInTopNav: false, navOrder: 60, homeEligible: false, overlays: ["chat"] },
  access: { requiredRoles: ["admin"], tokenScopes: ["secops:read", "secops:agent:invoke", "agents:invoke"], canUseCustomAgents: true, policyActions: [
    { action: "proxy:GET", description: "Read configured security-review evidence", defaultEffect: "allow", requiredScopes: ["secops:read"] },
    { action: "proxy:HEAD", description: "Probe SecOps readiness", defaultEffect: "allow", requiredScopes: ["secops:read"] },
    { action: "agent.invoke.secops", description: "Investigate selected security signals", defaultEffect: "allow", requiredScopes: ["secops:agent:invoke", "agents:invoke"] },
  ] },
  assistant: { enabled: true, agentId: "agent-secops", agentName: "SecOps Assistant", label: "Ask SecOps", schemaVersions: ["1.0"], capability: "contextual-chat" },
  agents: [{ id: "secops-agent", displayName: "SecOps Agent", required: true, dynamicAgentId: "agent-secops", capabilities: ["security-review"] }],
  data: { apiBasePath: "/api", eventChannels: [] },
  health: { endpoint: "/health/ready", timeoutMs: 1500, blockLaunchWhen: ["unreachable"] },
  catalog: { categories: ["security", "operations"], capabilities: ["aws-exposure-review", "iam-user-review", "github-branch-controls"] },
};
