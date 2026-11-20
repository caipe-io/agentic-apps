"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
export function RuntimeBridge({ prOnly = false }: { prOnly?: boolean }) {
  const pathname = usePathname();
  useEffect(() => {
    window.parent?.postMessage(
      {
        type: "caipe.agenticApp.context.v1",
        version: "1.0",
        appId: "agentic-sdlc",
        context: {
          route: pathname,
          title: "Agentic SDLC",
          agentId: "agent-agentic-sdlc",
          mcpServerId: "agentic_sdlc",
          domainAnswersRequireMcp: true,
          summary: prOnly
            ? "Pull-request review, code comments and CI evidence"
            : "Repository delivery and pull-request review state",
          suggestedPrompts: ["Summarize the current PR review and CI state."],
        },
      },
      window.location.origin,
    );
  }, [pathname, prOnly]);
  // CAIPE owns the assistant launcher; the app only publishes page context.
  return null;
}
