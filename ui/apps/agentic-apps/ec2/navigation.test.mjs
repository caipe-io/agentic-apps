import assert from "node:assert/strict";
import test from "node:test";
import { createQueryNavigation as createEc2Navigation } from "../../_lib/query-navigation.mjs";

function windowFixture(embedded = false) {
  const listeners = new Map(); const entries = []; const messages = []; const restored = [];
  const host = {
    location: new URL("https://example.test" + (embedded ? "/api/agentic-apps/runtime/ec2" : "/apps/ec2")),
    history: Object.fromEntries(["pushState", "replaceState"].map((mode) => [mode, (_state, _title, href) => { entries.push({ mode, href }); host.location = new URL(href, host.location); }])),
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
  };
  host.parent = embedded ? { postMessage: (message, origin) => messages.push({ message, origin }) } : host;
  const navigation = createEc2Navigation({ host, appId: "ec2", appPath: "/apps/ec2", restore: (query) => restored.push(query) });
  const receive = (message, options = {}) => listeners.get("message")?.({ source: host.parent, origin: host.location.origin, data: { appId: "ec2", version: "1.0", ...message }, ...options });
  return { host, entries, messages, restored, navigation, receive, listeners };
}

test("standalone commits one entry per view and restores browser history without echo", () => {
  const f = windowFixture();
  f.navigation.commit("tab=instances"); f.navigation.commit("tab=instances");
  f.navigation.commit("tab=instances&search=example", "replace");
  assert.deepEqual(f.entries.map((entry) => entry.mode), ["pushState", "replaceState"]);
  f.host.location.search = "?tab=search"; f.listeners.get("popstate")();
  assert.deepEqual(f.restored, ["?tab=search"]);
  assert.equal(f.entries.length, 2);
  f.navigation.dispose(); assert.equal(f.listeners.size, 0);
});

test("embedded navigation leaves runtime path intact and gives the host one history entry", () => {
  const f = windowFixture(true);
  assert.equal(f.messages[0].message.type, "caipe.agenticApp.bridge.connect.v1");
  f.receive({ type: "caipe.agenticApp.bridge.capabilities.v1", capabilities: { queryNavigation: true } });
  f.navigation.commit("tab=instances&instanceId=i-0123456789abcdef0");
  assert.equal(f.entries[0].mode, "replaceState");
  assert.equal(f.host.location.pathname, "/api/agentic-apps/runtime/ec2");
  assert.deepEqual(f.messages.at(-1).message, { type: "caipe.agenticApp.navigate.v1", appId: "ec2", version: "1.0", href: "/apps/ec2?tab=instances&instanceId=i-0123456789abcdef0", history: "push" });
  const before = f.messages.length;
  f.receive({ type: "caipe.agenticApp.navigation.v1", href: "/apps/ec2?tab=search&search=example" });
  assert.deepEqual(f.restored, ["?tab=search&search=example"]);
  assert.equal(f.messages.length, before);
  f.receive({ type: "caipe.agenticApp.navigation.v1", href: "/apps/ec2?tab=search&search=example" });
  assert.equal(f.restored.length, 1);
});

test("only the same-origin parent can grant query navigation or restore this app route", () => {
  const f = windowFixture(true);
  const capabilities = { type: "caipe.agenticApp.bridge.capabilities.v1", capabilities: { queryNavigation: true } };
  f.receive(capabilities, { origin: "https://other.example" });
  f.navigation.commit("tab=instances"); assert.equal(f.entries[0].mode, "pushState");
  f.receive(capabilities);
  for (const href of ["https://other.example/apps/ec2", "/apps/other?tab=search", "javascript:alert(1)"]) f.receive({ type: "caipe.agenticApp.navigation.v1", href });
  f.receive({ type: "caipe.agenticApp.navigation.v1", href: "/apps/ec2?tab=search" }, { source: f.host });
  assert.equal(f.restored.length, 0);
});
