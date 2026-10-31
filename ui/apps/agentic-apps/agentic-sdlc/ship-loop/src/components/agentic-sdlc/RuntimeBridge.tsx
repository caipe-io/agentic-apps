"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
export function RuntimeBridge({ prOnly = false }: { prOnly?: boolean }) {
  const pathname = usePathname();
  useEffect(() => {
    const tokens: Record<string, string[]> = {
      background: ["--background"], foreground: ["--foreground"],
      card: ["--card", "--popover"], cardForeground: ["--card-foreground", "--popover-foreground"],
      primary: ["--primary", "--ring"], primaryForeground: ["--primary-foreground"],
      secondary: ["--secondary", "--muted"], mutedForeground: ["--muted-foreground"],
      border: ["--border", "--input"], destructive: ["--destructive"],
    };
    const receive = (event: MessageEvent) => {
      const message = event.data;
      if (event.origin !== window.location.origin || event.source !== window.parent ||
          message?.type !== "caipe.microfrontend.initialize.v1" || message.version !== "1.0" || message.appId !== "agentic-sdlc") return;
      const palette = message.context?.palette;
      const valid = palette && Object.keys(tokens).every(key => typeof palette[key] === "string" && /^-?\d{1,3}(?:\.\d+)?\s+\d{1,3}(?:\.\d+)?%\s+\d{1,3}(?:\.\d+)?%$/.test(palette[key]));
      for (const [key, names] of Object.entries(tokens)) for (const name of names) {
        if (valid) document.documentElement.style.setProperty(name, palette[key]);
        else document.documentElement.style.removeProperty(name);
      }
      document.documentElement.dataset.caipePalette = valid ? "host" : "default";
      document.documentElement.style.colorScheme = message.context?.theme === "light" ? "light" : "dark";
      window.parent.postMessage({ type: "caipe.microfrontend.ready.v1", version: "1.0", appId: "agentic-sdlc" }, event.origin);
    };
    window.addEventListener("message", receive);
    if (window.parent !== window) window.parent.postMessage({ type: "caipe.microfrontend.ready.v1", version: "1.0", appId: "agentic-sdlc" }, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, []);
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
