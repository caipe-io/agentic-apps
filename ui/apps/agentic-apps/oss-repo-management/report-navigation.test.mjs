import assert from "node:assert/strict";
import test from "node:test";
import { createQueryNavigation } from "../../_lib/query-navigation.mjs";
import { createOssReportNavigation } from "./report-navigation.mjs";

function setup(search = "", runs = [], initialRepo = "", embedded = false) {
  const listeners = new Map(), entries = [new URL("https://example.test/apps/oss-repo-management" + search)];
  let index = 0;
  const host = { location: entries[0], addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type) { listeners.delete(type); } };
  const messages = [];
  host.parent = embedded ? { postMessage: message => messages.push(message) } : host;
  function move(offset) { index += offset; host.location = entries[index]; listeners.get("popstate")?.(); }
  host.history = {
    pushState(_state, _title, href) { entries.splice(index + 1); entries.push(new URL(href, host.location)); host.location = entries[++index]; },
    replaceState(_state, _title, href) { host.location = entries[index] = new URL(href, host.location); },
    back: () => move(-1), forward: () => move(1),
  };
  const calls = { live: [], snapshot: [], unavailable: [], section: [] };
  const navigation = createOssReportNavigation({ host, appPath: "/apps/oss-repo-management", initialRepo, getRuns: () => runs,
    onSection: section => calls.section.push(section),
    onLive: (...args) => calls.live.push(args), onSnapshot: (...args) => calls.snapshot.push(args), onUnavailable: (...args) => calls.unavailable.push(args),
  }, createQueryNavigation);
  const receive = data => listeners.get("message")({ source: host.parent, origin: host.location.origin, data: { version: "1.0", appId: "oss-repo-management", ...data } });
  return { host, calls, navigation, entries, messages, receive };
}
const run = (id, repo = "example/project", staleDays = 30) => ({ id, staleDays, updatedAt: "2026-07-01T12:00:00Z", dashboard: { repo } });

test("loads an exact snapshot without invoking the live-data loader", () => {
  const saved = run("snapshot-1", "example/project", 60);
  const app = setup("?repo=example/project&report=snapshot-1", [saved]);
  app.navigation.initialize();
  assert.deepEqual(app.calls.snapshot, [[saved, 60]]);
  assert.equal(app.calls.live.length, 0);
});

test("latest selects only a saved report for the requested repository", () => {
  const saved = run("snapshot-1");
  const app = setup("?repo=EXAMPLE/project&report=latest", [run("other", "example/secondary"), saved]);
  app.navigation.initialize();
  assert.equal(app.calls.snapshot[0][0], saved);
});

test("missing or mismatched saved reports never silently become a fresh report", () => {
  for (const search of ["?repo=example/project&report=missing", "?repo=example/secondary&report=snapshot-1"]) {
    const app = setup(search, [run("snapshot-1")]); app.navigation.initialize();
    assert.equal(app.calls.live.length, 0); assert.equal(app.calls.snapshot.length, 0);
    assert.match(app.calls.unavailable[0][0], /unavailable in this browser/);
  }
});

test("a generated snapshot produces a reloadable URL and preserves assistant parameters and anchors", () => {
  const saved = run("example/project::2026-07-01T12:00:00Z", "example/project", 60);
  const app = setup("?assistant=1#details", [saved]);
  app.navigation.live(saved.dashboard.repo, 60);
  app.navigation.remember(saved, 60);
  const params = app.host.location.searchParams;
  assert.equal(params.get("repo"), saved.dashboard.repo); assert.equal(params.get("report"), saved.id);
  assert.equal(params.get("staleDays"), "60"); assert.equal(params.get("assistant"), "1");
  assert.equal(app.host.location.hash, "#details");
  const reload = setup(app.host.location.search + app.host.location.hash, [saved]); reload.navigation.initialize();
  assert.equal(reload.calls.snapshot[0][0].id, saved.id);
});

test("Back and Forward restore selected reports without fetching data", () => {
  const first = run("first"), second = run("second");
  const app = setup("?repo=example/project&report=first", [second, first]);
  app.navigation.initialize(); app.navigation.select("second");
  app.host.history.back(); app.host.history.forward();
  assert.deepEqual(app.calls.snapshot.map(([r]) => r.id), ["first", "second", "first", "second"]);
  assert.equal(app.calls.live.length, 0);
});

test("repository-only links load current data; invalid thresholds and repository values are rejected", () => {
  const app = setup("?repo=example/project&staleDays=90"); app.navigation.initialize();
  assert.deepEqual(app.calls.live, [["example/project", 90]]);
  for (const query of ["?repo=../../etc", "?repo=example/project&staleDays=0", "?repo=example/project&staleDays=366", "?repo=example/project&staleDays=NaN"]) {
    const invalid = setup(query); invalid.navigation.initialize(); assert.equal(invalid.calls.live.length, 0); assert.equal(invalid.calls.unavailable.length, 1);
  }
});


test("tab changes and Back/Forward preserve the exact snapshot without reloading evidence", () => {
  const app = setup("?repo=example/project&report=snapshot-1&assistant=1#details", [run("snapshot-1")]);
  app.navigation.initialize();
  app.navigation.section("activity"); app.navigation.section("community");
  assert.equal(app.host.location.searchParams.get("report"), "snapshot-1");
  assert.equal(app.host.location.searchParams.get("assistant"), "1");
  assert.equal(app.host.location.hash, "#details");
  app.host.history.back(); app.host.history.back(); app.host.history.forward();
  assert.deepEqual(app.calls.section, ["overview", "activity", "community", "activity", "overview", "activity"]);
  assert.equal(app.calls.snapshot.length, 1);
  assert.equal(app.calls.live.length, 0);
});

test("a bookmarked tab restores together with its saved report", () => {
  const app = setup("?repo=example/project&report=snapshot-1&tab=priorities", [run("snapshot-1")]);
  app.navigation.initialize();
  assert.deepEqual(app.calls.section, ["priorities"]);
  assert.equal(app.calls.snapshot.length, 1);
});

test("tab-only history changes do not refetch a live repository", () => {
  const app = setup("?repo=example/project"); app.navigation.initialize();
  app.navigation.section("activity"); app.host.history.back(); app.host.history.forward();
  assert.equal(app.calls.live.length, 1);
  assert.deepEqual(app.calls.section, ["overview", "activity", "overview", "activity"]);
});

test("legacy section anchors migrate to tab queries without fragment scrolling", () => {
  for (const [hash, tab] of [["#overview", "overview"], ["#actionsPanel", "priorities"], ["#trendsPanel", "activity"], ["#healthPanel", "community"]]) {
    const app = setup("?repo=example/project&report=snapshot-1" + hash, [run("snapshot-1")]);
    app.navigation.initialize();
    assert.equal(app.host.location.hash, "");
    assert.equal(app.host.location.searchParams.get("tab"), tab);
    assert.equal(app.host.location.searchParams.get("report"), "snapshot-1");
    assert.deepEqual(app.calls.section, [tab]);
    assert.equal(app.entries.length, 1);
  }
});

test("unknown tab values fall back to Overview and cannot write arbitrary navigation", () => {
  for (const tab of ["unknown", "constructor", "__proto__"]) {
    const app = setup("?tab=" + tab); app.navigation.initialize();
    assert.deepEqual(app.calls.section, ["overview"]);
    app.navigation.section(tab);
    assert.equal(app.entries.length, 1);
  }
});


test("a plain app visit resumes the last generated report without fetching or adding history", () => {
  const latest = run("newest", "example/secondary", 60);
  const app = setup("", [latest, run("older")], "example/configured");
  app.navigation.initialize();
  assert.deepEqual(app.calls.snapshot, [[latest, 60]]);
  assert.equal(app.calls.live.length, 0);
  assert.equal(app.host.location.searchParams.get("repo"), "example/secondary");
  assert.equal(app.host.location.searchParams.get("report"), "newest");
  assert.equal(app.host.location.searchParams.get("staleDays"), "60");
  assert.equal(app.entries.length, 1);
  const reload = setup(app.host.location.search, [run("newer"), latest]);
  reload.navigation.initialize();
  assert.equal(reload.calls.snapshot[0][0], latest);
});

test("default restoration preserves section, assistant state, and unrelated fragments", () => {
  const latest = run("newest");
  for (const [search, section, hash] of [["?tab=activity&assistant=1#details", "activity", "#details"], ["?assistant=1#actionsPanel", "priorities", ""]]) {
    const app = setup(search, [latest]); app.navigation.initialize();
    assert.deepEqual(app.calls.section, [section]);
    assert.equal(app.calls.snapshot[0][0], latest);
    assert.equal(app.host.location.searchParams.get("assistant"), "1");
    assert.equal(app.host.location.hash, hash);
    assert.equal(app.entries.length, 1);
  }
});

test("without saved reports the default visit keeps the welcome or configured live repository", () => {
  const blank = setup(); blank.navigation.initialize();
  assert.deepEqual(blank.calls.live, [["", 30]]);
  assert.equal(blank.calls.snapshot.length, 0);
  assert.equal(blank.host.location.search, "");
  const configured = setup("", [], "example/configured"); configured.navigation.initialize();
  assert.deepEqual(configured.calls.live, [["example/configured", 30]]);
});

test("explicit live, saved, and unavailable links take precedence over default history", () => {
  const latest = run("newest"), older = run("older", "example/secondary");
  const live = setup("?repo=example/project", [latest, older]); live.navigation.initialize();
  assert.deepEqual(live.calls.live, [["example/project", 30]]);
  assert.equal(live.calls.snapshot.length, 0);
  const exact = setup("?report=older", [latest, older]); exact.navigation.initialize();
  assert.equal(exact.calls.snapshot[0][0], older);
  const missing = setup("?report=missing", [latest, older]); missing.navigation.initialize();
  assert.equal(missing.calls.snapshot.length, 0);
  assert.equal(missing.calls.unavailable.length, 1);
  const empty = setup("?repo=", [latest]); empty.navigation.initialize();
  assert.deepEqual(empty.calls.live, [["", 30]]);
  const threshold = setup("?staleDays=90", [latest], "example/configured"); threshold.navigation.initialize();
  assert.deepEqual(threshold.calls.live, [["example/configured", 90]]);
});

test("malformed saved entries cannot prevent restoration of the next usable report", () => {
  const latest = run("valid");
  const app = setup("", [null, { dashboard: {} }, run(""), run("bad", "invalid"), latest]);
  app.navigation.initialize();
  assert.equal(app.calls.snapshot[0][0], latest);
  assert.equal(app.calls.live.length, 0);
  assert.equal(app.calls.unavailable.length, 0);
});

test("tabs and history retain the report resumed by the default visit", () => {
  const latest = run("newest"), other = run("older", "example/secondary");
  const app = setup("", [latest, other]);
  app.navigation.initialize(); app.navigation.section("activity"); app.navigation.select("older");
  app.host.history.back(); app.host.history.back(); app.host.history.forward();
  assert.deepEqual(app.calls.snapshot.map(([r]) => r.id), ["newest", "older", "newest"]);
  assert.equal(app.calls.live.length, 0);
  assert.equal(app.host.location.searchParams.get("report"), "newest");
  assert.deepEqual(app.calls.section, ["overview", "activity", "activity", "overview", "activity"]);
});


test("the host bridge adopts the resumed snapshot after its asynchronous handshake", () => {
  const latest = run("newest");
  const app = setup("?tab=activity&assistant=1", [latest], "", true);
  app.navigation.initialize();
  app.receive({ type: "caipe.agenticApp.bridge.capabilities.v1", capabilities: { queryNavigation: true } });
  app.receive({ type: "caipe.agenticApp.navigation.v1", href: "/apps/oss-repo-management?tab=activity&assistant=1" });
  const navigations = app.messages.filter(message => message.type === "caipe.agenticApp.navigate.v1");
  assert.equal(navigations.length, 1);
  assert.equal(navigations[0].history, "replace");
  const params = new URL(navigations[0].href, app.host.location.origin).searchParams;
  assert.equal(params.get("report"), "newest");
  assert.equal(params.get("repo"), "example/project");
  assert.equal(params.get("tab"), "activity");
  assert.equal(params.get("assistant"), "1");
  assert.equal(app.calls.snapshot.length, 1);
  assert.equal(app.calls.live.length, 0);
});
