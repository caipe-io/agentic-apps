import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("./public/theme.js", import.meta.url), "utf8");
function setup(dark = false) {
  const styles = new Map();
  const root = { dataset: {}, classList: { toggle(name, value) { root.dark = value; } }, style: {
    setProperty: (name, value) => styles.set(name, value), removeProperty: name => styles.delete(name),
  } };
  let receive, systemChanged;
  const media = { matches: dark, addEventListener(type, fn) { systemChanged = fn; } };
  const sent = [];
  const window = { location: { origin: "https://example.test" }, parent: { postMessage: message => sent.push(message) },
    matchMedia: () => media, addEventListener(type, fn) { receive = fn; } };
  runInNewContext(source, { document: { documentElement: root }, window });
  function initialize(context, overrides = {}) {
    receive({ origin: window.location.origin, source: window.parent, data: {
      type: "caipe.microfrontend.initialize.v1", version: "1.0", appId: "agentic-sdlc", context,
    }, ...overrides });
  }
  return { root, styles, sent, initialize, system(dark) { media.matches = dark; systemChanged(); } };
}

test("follows the system until Grid selects an explicit mode, and supports live changes", () => {
  const app = setup();
  assert.equal(app.root.dataset.caipeTheme, "light");
  app.system(true);
  assert.equal(app.root.dataset.caipeTheme, "dark");
  app.initialize({ theme: "light" });
  app.system(true);
  assert.equal(app.root.dataset.caipeTheme, "light");
  assert.equal(app.root.dark, false);
  assert.equal(app.root.style.colorScheme, "light");
  app.initialize({ theme: "dark" });
  assert.equal(app.root.dark, true);
  app.initialize({ theme: "system" });
  app.system(false);
  assert.equal(app.root.dataset.caipeTheme, "light");
  assert.equal(app.sent[0].type, "caipe.microfrontend.ready.v1");
});

test("applies complete host palettes and clears stale overrides for defaults", () => {
  const app = setup(true);
  const palette = Object.fromEntries(["background", "foreground", "card", "cardForeground", "primary", "primaryForeground", "secondary", "mutedForeground", "border", "destructive"].map(key => [key, "173 80% 35%"]));
  app.initialize({ theme: "light", palette });
  assert.equal(app.root.dataset.caipePalette, "host");
  assert.equal(app.styles.get("--primary"), palette.primary);
  assert.equal(app.styles.get("--popover"), palette.card);
  app.initialize({ theme: "dark", palette: { ...palette, primary: "red; color: white" } });
  assert.equal(app.root.dataset.caipePalette, "default");
  assert.equal(app.styles.size, 0);
});

test("ignores messages from unrelated origins, windows, apps and protocol versions", () => {
  const app = setup();
  app.initialize({ theme: "dark" }, { origin: "https://other.example.test" });
  app.initialize({ theme: "dark" }, { source: {} });
  for (const data of [null, { type: "caipe.microfrontend.initialize.v1", version: "2.0", appId: "agentic-sdlc", context: { theme: "dark" } }, { type: "caipe.microfrontend.initialize.v1", version: "1.0", appId: "other-app", context: { theme: "dark" } }]) app.initialize({}, { data });
  assert.equal(app.root.dataset.caipeTheme, "light");
  assert.equal(app.sent.length, 1);
});

test("the before-paint theme asset is included in the deployed standalone image", () => {
  const layout = readFileSync(new URL("./src/app/layout.tsx", import.meta.url), "utf8");
  const image = readFileSync(new URL("../../../../../build/Dockerfile.agentic-sdlc", import.meta.url), "utf8");
  assert.match(layout, /<script src="\/apps\/agentic-sdlc\/theme\.js"/);
  assert.match(image, /COPY --from=build[^\n]*\/app\/public \.\/public/);
});
