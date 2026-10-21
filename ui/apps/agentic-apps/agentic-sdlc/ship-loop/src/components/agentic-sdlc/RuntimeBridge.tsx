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
  return (
    <button
      className="fixed bottom-5 right-5 z-50 rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-lg"
      onClick={() =>
        window.parent?.postMessage(
          {
            type: "caipe.agenticApp.assistant.open.v1",
            version: "1.0",
            appId: "agentic-sdlc",
            prompt: prOnly
              ? "Summarize current-head PR reviews, actionable inline findings and CI evidence for the selected repository. Identify missing evidence."
              : "Summarize delivery risk from this repository or PR view.",
          },
          window.location.origin,
        )
      }
    >
      Ask Agentic SDLC
    </button>
  );
}
