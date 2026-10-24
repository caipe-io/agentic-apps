export const EC2_APP_ID = "ec2";

export const EC2_MANIFEST = {
  id: EC2_APP_ID,
  displayName: "EC2 Instances Dashboard",
  description: "AWS account and region inventory with instance sizes, OS, tags, on-demand cost estimates, and AWS MCP questions.",
  apiVersion: "1.0",
  runtime: { kind: "proxied-next-zone", mountPath: "/apps/ec2", chrome: "iframe" },
  ui: {
    contractVersion: "1.0", surface: "hosted", routes: ["/"],
    preferences: { schemaVersion: "1.0", fields: [
      { key: "density", label: "Dashboard density", type: "enum", default: "comfortable", options: [{ label: "Compact", value: "compact" }, { label: "Comfortable", value: "comfortable" }] },
      { key: "textScale", label: "Text size", type: "enum", default: "default", options: [{ label: "Small", value: "small" }, { label: "Default", value: "default" }, { label: "Large", value: "large" }, { label: "Extra large", value: "xl" }] },
    ] },
  },
  authorization: { resourceType: "agentic_app", launchAction: "use" },
  surfaces: { showInHub: true, showInTopNav: false, navOrder: 26, homeEligible: false, overlays: ["chat", "generative-ui"] },
  access: {
    requiredRoles: ["user"], tokenScopes: ["ec2:read", "ec2:agent:invoke", "agents:invoke"], canUseCustomAgents: true,
    policyActions: [
      { action: "proxy:GET", description: "Read EC2 dashboard pages and configured scope", defaultEffect: "allow", requiredScopes: ["ec2:read"] },
      { action: "proxy:HEAD", description: "Probe EC2 dashboard pages", defaultEffect: "allow", requiredScopes: ["ec2:read"] },
      { action: "proxy:POST", description: "Prepare EC2 agent requests for configured AWS profiles", defaultEffect: "allow", requiredScopes: ["ec2:agent:invoke"] },
      { action: "agent.invoke.ec2", description: "Ask the EC2 agent for read-only AWS MCP evidence", defaultEffect: "allow", requiredScopes: ["ec2:agent:invoke", "agents:invoke"] },
    ],
  },
  assistant: { enabled: true, agentId: "agent-ec2", schemaVersions: ["1.0"], maxContextBytes: 8192, capability: "contextual-chat", suggestions: true, label: "Ask AWS", agentName: "EC2 Assistant" },
  agents: [{ id: "ec2-agent", displayName: "EC2 Assistant", required: true, dynamicAgentId: "agent-ec2", capabilities: ["aws-ec2-inventory", "aws-pricing", "instance-tags"] }],
  data: { apiBasePath: "/api/ec2", eventChannels: ["ec2.inventory.updated"] },
  health: { endpoint: "/health/ready", timeoutMs: 1500, blockLaunchWhen: ["degraded", "unreachable"] },
  catalog: { categories: ["aws", "infrastructure", "finops"], capabilities: ["aws-ec2-inventory", "instance-tags", "on-demand-cost-estimates", "assistant-context-bridge"] },
};
