export function renderMicrofrontendClient(appId, env = process.env) {
  const version = env.APP_BUILD_VERSION !== "unknown" && /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,127}$/.test(env.APP_BUILD_VERSION || "") ? env.APP_BUILD_VERSION : null;
  const revision = /^[a-f0-9]{7,64}$/i.test(env.APP_BUILD_REVISION || "") ? env.APP_BUILD_REVISION : null;
  const display = version && version === revision ? revision.slice(0, 12) : version && revision ? `${version} · ${revision.slice(0, 12)}` : version || revision?.slice(0, 12) || "unavailable";
  const safeAppId = JSON.stringify(appId);
  return `<div aria-label="Application build version" title="${revision || "Build revision unavailable"}" style="padding:10px 24px;text-align:right;color:var(--muted,#64748b);font:12px/1.4 system-ui,sans-serif">Build ${display}</div><script>
    (() => {
      const appId = ${safeAppId};
      const initializeType = "caipe.microfrontend.initialize.v1";
      const readyType = "caipe.microfrontend.ready.v1";
      window.addEventListener("message", (event) => {
        const message = event.data;
        if (event.origin !== window.location.origin || event.source !== window.parent) return;
        if (!message || message.type !== initializeType || message.version !== "1.0" || message.appId !== appId) return;
        const context = message.context || {};
        document.documentElement.dataset.caipeSurface = context.surface || "hosted";
        document.documentElement.dataset.caipeTheme = context.theme || "system";
        if (context.theme === "light" || context.theme === "dark") document.documentElement.style.colorScheme = context.theme;
        const palette = context.palette;
        const tokens = {
          background: ["--bg", "--caipe-background"],
          foreground: ["--text", "--caipe-foreground"],
          card: ["--surface", "--caipe-card"],
          cardForeground: ["--caipe-card-foreground"],
          primary: ["--accent", "--series", "--caipe-primary"],
          primaryForeground: ["--on-accent", "--caipe-primary-foreground"],
          secondary: ["--track", "--caipe-secondary"],
          mutedForeground: ["--muted", "--caipe-muted-foreground"],
          border: ["--line", "--caipe-border"],
          destructive: ["--caipe-destructive"],
        };
        const validPalette = palette && Object.keys(tokens).every((key) =>
          typeof palette[key] === "string" && /^-?\\d{1,3}(?:\\.\\d+)?\\s+\\d{1,3}(?:\\.\\d+)?%\\s+\\d{1,3}(?:\\.\\d+)?%$/.test(palette[key]));
        for (const [key, names] of Object.entries(tokens)) {
          for (const name of names) {
            if (validPalette) document.documentElement.style.setProperty(name, "hsl(" + palette[key] + ")");
            else document.documentElement.style.removeProperty(name);
          }
        }
        document.documentElement.dataset.caipePalette = validPalette ? "host" : "default";
        const density = context.preferences && context.preferences.density;
        if (document.body) document.body.classList.toggle("compact", density !== "comfortable");
        const textScale = context.preferences && context.preferences.textScale;
        const textScales = { small: "0.9", default: "1", large: "1.12", xl: "1.25" };
        document.documentElement.style.setProperty(
          "--app-font-scale",
          textScales[textScale] || textScales.default,
        );
        window.dispatchEvent(new CustomEvent("caipe:microfrontend-initialize", { detail: context }));
        window.parent.postMessage({ type: readyType, version: "1.0", appId }, event.origin);
      });
    })();
  </script>`;
}
