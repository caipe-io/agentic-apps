import assert from "node:assert/strict";
import test from "node:test";
import { bindQueryControls } from "./query-controls.mjs";
import { createQueryNavigation } from "./query-navigation.mjs";

function fixture(search = "") {
  const handlers = new Map();
  class Control extends EventTarget {
    constructor(type, value, choices) { super(); this.type = type; this.value = value; this.checked = false; this.tagName = choices ? "SELECT" : "INPUT"; this.options = (choices || []).map(value => ({value})); }
  }
  const nodes = { account: new Control("select-one", "primary", ["primary", "secondary"]), search: new Control("search", ""), older: new Control("checkbox", "on") };
  const host = { Event, location: new URL("https://example.test/apps/example" + search), document: { getElementById: id => nodes[id] }, addEventListener: (t, f) => handlers.set(t, f), removeEventListener: t => handlers.delete(t) };
  host.parent = host;
  const entries = [];
  host.history = { pushState(_s, _t, url) { entries.push("push"); host.location = new URL(url, host.location); }, replaceState(_s, _t, url) { entries.push("replace"); host.location = new URL(url, host.location); } };
  let scopeChanges = 0, invalid = 0;
  nodes.account.addEventListener("change", () => scopeChanges++);
  const binding = bindQueryControls({ host, appId: "example", appPath: "/apps/example", fields: [{ name: "profile", id: "account" }, { name: "q", id: "search" }, { name: "older", id: "older" }], onInvalid: () => invalid++ }, createQueryNavigation);
  return { host, nodes, entries, binding, scopeChanges: () => scopeChanges, invalid: () => invalid, restore(search) { host.location = new URL("https://example.test/apps/example" + search); handlers.get("popstate")(); } };
}

test("restores configured scopes and filters without creating navigation entries", () => {
  const app = fixture("?profile=secondary&q=test-user&older=1");
  assert.equal(app.nodes.account.value, "secondary"); assert.equal(app.nodes.search.value, "test-user"); assert.equal(app.nodes.older.checked, true);
  assert.deepEqual(app.entries, []);
});
test("text editing creates one history entry, preserves unrelated parameters and anchors", () => {
  const app = fixture("?assistant=1#details");
  app.nodes.search.value = "first"; app.nodes.search.dispatchEvent(new Event("input"));
  app.nodes.search.value = "second"; app.nodes.search.dispatchEvent(new Event("input"));
  assert.deepEqual(app.entries, ["push", "replace"]);
  assert.equal(app.host.location.searchParams.get("assistant"), "1"); assert.equal(app.host.location.hash, "#details");
  assert.equal(app.host.location.searchParams.get("q"), "second");
});
test("Back/Forward changing a search does not invalidate an unchanged evidence scope", () => {
  const app = fixture("?profile=secondary&q=first"); const changes = app.scopeChanges();
  app.restore("?profile=secondary&q=second");
  assert.equal(app.nodes.search.value, "second"); assert.equal(app.scopeChanges(), changes);
});
test("unavailable scopes are rejected rather than sent to a backend", () => {
  const app = fixture("?profile=unconfigured");
  assert.equal(app.nodes.account.value, "primary"); assert.equal(app.invalid(), 1);
});
