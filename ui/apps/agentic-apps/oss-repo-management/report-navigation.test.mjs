import assert from "node:assert/strict";
import test from "node:test";
import { createQueryNavigation } from "../../_lib/query-navigation.mjs";
import { createOssReportNavigation } from "./report-navigation.mjs";

function setup(search = "", runs = []) {
  const listeners = new Map(), entries = [new URL("https://example.test/apps/oss-repo-management" + search)];
  let index = 0;
  const host = { location: entries[0], addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type) { listeners.delete(type); } };
  host.parent = host;
  function move(offset) { index += offset; host.location = entries[index]; listeners.get("popstate")?.(); }
  host.history = {
    pushState(_state, _title, href) { entries.splice(index + 1); entries.push(new URL(href, host.location)); host.location = entries[++index]; },
    replaceState(_state, _title, href) { host.location = entries[index] = new URL(href, host.location); },
    back: () => move(-1), forward: () => move(1),
  };
  const calls = { live: [], snapshot: [], unavailable: [], section: [] };
  const navigation = createOssReportNavigation({ host, appPath: "/apps/oss-repo-management", getRuns: () => runs,
    onSection: section => calls.section.push(section),
    onLive: (...args) => calls.live.push(args), onSnapshot: (...args) => calls.snapshot.push(args), onUnavailable: (...args) => calls.unavailable.push(args),
  }, createQueryNavigation);
  return { host, calls, navigation, entries };
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
