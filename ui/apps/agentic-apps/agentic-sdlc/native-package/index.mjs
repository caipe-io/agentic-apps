"use client";

import { createElement as h, useEffect, useState } from "react";

import { invokeDeliveryDashboard, loadNativeContext } from "./client.mjs";
import { pathForRepository, repositoryFromPath, ROOT_PATH } from "./routes.mjs";

function AgenticSdlcNative({ pathname, navigate, setBreadcrumbs }) {
  const routeRepository = repositoryFromPath(pathname);
  const [repository, setRepository] = useState(routeRepository);
  const [context, setContext] = useState(null);
  const [contextError, setContextError] = useState("");
  const [dashboard, setDashboard] = useState("");
  const [dashboardError, setDashboardError] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setRepository(routeRepository);
    setBreadcrumbs([
      { label: "Home", href: "/" },
      { label: "Agentic SDLC", href: ROOT_PATH },
      ...(routeRepository ? [{ label: routeRepository }] : []),
    ]);
    performance.mark?.("agentic-sdlc:native-render-ready");
  }, [routeRepository, setBreadcrumbs]);

  useEffect(() => {
    const controller = new AbortController();
    loadNativeContext({ signal: controller.signal })
      .then((value) => {
        setContext(value);
        setContextError("");
        performance.mark?.("agentic-sdlc:native-data-ready");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setContextError(error.message);
      });
    return () => controller.abort();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    const target = repository.trim();
    if (!target || loading) return;
    const route = pathForRepository(target);
    if (route && route !== pathname) navigate(route);
    setLoading(true);
    setDashboard("");
    setDashboardError("");
    setConversationId("");
    try {
      const result = await invokeDeliveryDashboard(target);
      setDashboard(result.content);
      setConversationId(result.conversationId);
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : "Dashboard request failed");
    } finally {
      setLoading(false);
    }
  }

  return h("main", { className: "caipe-sdlc-native" },
    h("section", { className: "caipe-sdlc-native__card" },
      h("p", { className: "caipe-sdlc-native__eyebrow" }, "Native extension example"),
      h("h1", null, "Agentic SDLC"),
      h("p", { className: "caipe-sdlc-native__intro" },
        "Explore repository delivery with the dedicated CAIPE agent. This screen shares the CAIPE router, theme, session, and breadcrumbs."),
      context && h("p", { className: "caipe-sdlc-native__status" },
        `Authenticated app gateway · ${context.authorization?.launchDecision ?? "ready"}`),
      contextError && h("p", { className: "caipe-sdlc-native__error", role: "alert" }, contextError),
      h("form", { className: "caipe-sdlc-native__form", onSubmit: handleSubmit },
        h("label", { htmlFor: "caipe-sdlc-repository" }, "Repository"),
        h("div", { className: "caipe-sdlc-native__form-row" },
          h("input", {
            id: "caipe-sdlc-repository",
            value: repository,
            onChange: (event) => setRepository(event.target.value),
            placeholder: "owner/repository",
            required: true,
          }),
          h("button", { type: "submit", disabled: loading },
            loading ? "Building dashboard…" : "Pull delivery dashboard"),
        ),
      ),
      h("div", { className: "caipe-sdlc-native__dashboard", "aria-live": "polite" },
        dashboardError && h("p", { className: "caipe-sdlc-native__error", role: "alert" }, dashboardError),
        dashboard
          ? h("pre", null, dashboard)
          : !dashboardError && h("p", null, "Enter a repository to request a delivery summary."),
        conversationId && h("button", {
          type: "button",
          className: "caipe-sdlc-native__link",
          onClick: () => navigate(`/chat/${encodeURIComponent(conversationId)}`),
        }, "Open conversation in CAIPE"),
      ),
    ),
  );
}

export default {
  contractVersion: "1.1",
  Component: AgenticSdlcNative,
};
