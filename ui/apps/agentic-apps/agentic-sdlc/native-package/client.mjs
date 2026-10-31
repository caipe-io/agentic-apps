const APP_ID = "agentic-sdlc";
const AGENT_ID = "agent-agentic-sdlc";

async function readJson(response, fallback) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${fallback} (invalid response)`);
  }
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || payload?.message || `${fallback} (HTTP ${response.status})`);
  }
  return payload;
}

export async function loadNativeContext({ signal, fetchImpl = fetch } = {}) {
  const response = await fetchImpl("/api/agentic-sdlc/context", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
    signal,
  });
  const context = await readJson(response, "Could not load app context");
  if (context.appId !== APP_ID || context.agentId !== AGENT_ID) {
    throw new Error("App context does not match this extension");
  }
  return context;
}

export async function invokeDeliveryDashboard(repository, fetchImpl = fetch) {
  const target = String(repository ?? "").trim();
  if (!target) throw new Error("Repository is required");

  const conversationResponse = await fetchImpl("/api/chat/conversations", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      title: `Agentic SDLC dashboard · ${target}`.slice(0, 120),
      client_type: "webui",
      agent_id: AGENT_ID,
      metadata: { dashboardKind: "delivery-dashboard", source: "agentic-app", appId: APP_ID },
      tags: ["agentic-app", APP_ID],
    }),
  });
  const conversation = await readJson(conversationResponse, "Could not create dashboard conversation");
  const conversationId = conversation.data?.conversation?._id || conversation.conversation?._id;
  if (typeof conversationId !== "string" || !conversationId) {
    throw new Error("Conversation creation returned no ID");
  }

  const invokeResponse = await fetchImpl("/api/v1/chat/invoke", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      agent_id: AGENT_ID,
      conversation_id: conversationId,
      message: [
        `Build a delivery-dashboard for ${target}.`,
        "Return JSON first, then a concise explanation.",
        "JSON schema: { repository, stage, risks: string[], openWork: string[], recommendedNextActions: string[] }.",
        "Use only available CAIPE SDLC context and say what is missing if the repo cannot be inspected.",
      ].join(" "),
      client_context: {
        dashboardKind: "delivery-dashboard",
        repository: target,
        source: "agentic-app",
        appId: APP_ID,
      },
    }),
  });
  const result = await readJson(invokeResponse, "Dashboard agent invocation failed");
  const content = result.content || result.message || JSON.stringify(result, null, 2);
  return {
    conversationId,
    content: typeof content === "string" ? content : JSON.stringify(content, null, 2),
  };
}
