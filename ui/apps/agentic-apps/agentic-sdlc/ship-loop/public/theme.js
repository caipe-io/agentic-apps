/* Runs before paint; Grid owns the theme when embedded. */
(() => {
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  let hostTheme;
  function syncTheme() {
    const theme = hostTheme || (media.matches ? "dark" : "light");
    root.dataset.caipeTheme = theme;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }
  const tokens = {
    background: ["--background"], foreground: ["--foreground"],
    card: ["--card", "--popover"], cardForeground: ["--card-foreground", "--popover-foreground"],
    primary: ["--primary", "--ring"], primaryForeground: ["--primary-foreground"],
    secondary: ["--secondary", "--muted"], mutedForeground: ["--muted-foreground"],
    border: ["--border", "--input"], destructive: ["--destructive"],
  };
  const ready = () => window.parent.postMessage({
    type: "caipe.microfrontend.ready.v1", version: "1.0", appId: "agentic-sdlc",
  }, window.location.origin);
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (event.origin !== window.location.origin || event.source !== window.parent ||
        message?.type !== "caipe.microfrontend.initialize.v1" ||
        message.version !== "1.0" || message.appId !== "agentic-sdlc") return;
    const context = message.context || {};
    hostTheme = context.theme === "light" || context.theme === "dark" ? context.theme : undefined;
    syncTheme();
    const palette = context.palette;
    const valid = palette && Object.keys(tokens).every(key =>
      typeof palette[key] === "string" && /^-?\d{1,3}(?:\.\d+)?\s+\d{1,3}(?:\.\d+)?%\s+\d{1,3}(?:\.\d+)?%$/.test(palette[key]));
    for (const [key, names] of Object.entries(tokens)) for (const name of names) {
      if (valid) root.style.setProperty(name, palette[key]);
      else root.style.removeProperty(name);
    }
    root.dataset.caipePalette = valid ? "host" : "default";
    ready();
  });
  syncTheme();
  media.addEventListener("change", syncTheme);
  if (window.parent !== window) ready();
})();
