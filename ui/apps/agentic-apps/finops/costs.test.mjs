import assert from "node:assert/strict";
import test from "node:test";
import { costAnomalySignals, costPeriod, finopsCostConfiguration, rollupCostRows } from "./costs.mjs";
import { createFinopsCostService } from "./sdk-costs.mjs";

function fixture(overrides = {}) {
  let time = Date.parse("2026-10-26T00:00:00Z"), calls = 0, identities = 0, active = 0, maximum = 0;
  const fail = new Set();
  const config = finopsCostConfiguration({ FINOPS_AWS_ACCOUNT_LIST: "primary:111111111111,secondary:222222222222", ...overrides });
  const clientsForScope = (scope) => ({
    sts: { async send() { identities += 1; return { Account: scope.accountId }; } },
    ce: { async send(command) {
      calls += 1; active += 1; maximum = Math.max(maximum, active);
      try {
        await new Promise((resolve) => setImmediate(resolve));
        if (fail.has(scope.profile)) throw Object.assign(new Error("not authorized"), { name: "AccessDeniedException" });
        const input = command.input;
        assert.deepEqual(input.Filter, { Dimensions: { Key: "LINKED_ACCOUNT", Values: [scope.accountId] } });
        assert.deepEqual(input.Metrics, ["UnblendedCost"]);
        assert.deepEqual(input.GroupBy, [{ Type: "DIMENSION", Key: "SERVICE" }]);
        const page = input.NextPageToken ? 1 : 0; const ResultsByTime = [];
        for (let date = Date.parse(input.TimePeriod.Start); date < Date.parse(input.TimePeriod.End); date += 86400000) {
          const iso = new Date(date).toISOString().slice(0, 10);
          ResultsByTime.push({ TimePeriod: { Start: iso, End: new Date(date + 86400000).toISOString().slice(0, 10) }, Estimated: iso >= "2026-10-01", Groups: [{ Keys: [page ? "Credits" : "Compute"], Metrics: { UnblendedCost: { Amount: page ? "-0.25" : "10", Unit: "USD" } } }] });
        }
        return { ResultsByTime, ...(page ? {} : { NextPageToken: "second-page" }) };
      } finally { active -= 1; }
    } },
  });
  const service = createFinopsCostService(config, { clientsForScope, now: () => time });
  return { config, clientsForScope, service, fail, advance: (ms) => { time += ms; }, calls: () => calls, identities: () => identities, max: () => maximum };
}

test("calendar periods exclude the current UTC day and handle year/month boundaries", () => {
  assert.deepEqual(costPeriod("month", Date.parse("2026-10-26T23:00:00Z")), { key: "month", label: "Current month", start: "2026-10-01", end: "2026-10-26" });
  assert.equal(costPeriod("12m", Date.parse("2026-01-01T00:00Z")).start, "2025-02-01");
  assert.equal(costPeriod("previous-month", Date.parse("2026-01-15T00:00Z")).end, "2026-01-01");
  assert.throws(() => costPeriod("all-time"), /supported/);
  assert.throws(() => costPeriod("toString"), /supported/);
});

test("configuration rejects duplicate accounts, incomplete identity mappings, and invalid cache bounds", () => {
  for (const env of [{ FINOPS_AWS_ACCOUNT_LIST: "primary:111111111111,alias:111111111111" }, { FINOPS_AWS_ACCOUNT_LIST: "primary" }, { FINOPS_CACHE_TTL_SECONDS: "0" }]) assert.throws(() => finopsCostConfiguration(env));
});

test("full pagination preserves credits and reconciles account/service/trend totals", async () => {
  const f = fixture(); const data = await f.service.view();
  assert.equal(data.status, "ready"); assert.equal(f.calls(), 4); assert.equal(f.identities(), 2);
  assert.equal(data.accounts.length, 2); assert.ok(data.accounts.every((a) => a.status === "ready" && a.pages === 2 && a.missingDays === 0));
  assert.equal(data.totalCost, 25 * 9.75 * 2);
  assert.equal(data.services.reduce((s, r) => s + r.amount, 0), data.totalCost);
  assert.equal(data.trend.reduce((s, r) => s + r.amount, 0), data.totalCost);
  assert.ok(data.rows.some((r) => r.amount < 0)); assert.equal(f.max(), 2);
});

test("concurrent readers share requests and filters reuse the same complete snapshots", async () => {
  const f = fixture(); await Promise.all([f.service.view(), f.service.view(), f.service.view({ period: "3m" })]);
  assert.equal(f.calls(), 4);
  const data = await f.service.view({ profile: "primary", period: "previous-month" });
  assert.equal(data.accounts.length, 1); assert.ok(data.accounts[0].cache.hit); assert.equal(data.totalCost, 30 * 9.75);
  assert.equal(f.calls(), 4); await assert.rejects(f.service.view({ profile: "unconfigured" }), /configured AWS account/);
});

test("cache expiry retains bounded stale data after failures without renewing its expiry", async () => {
  const f = fixture(); await f.service.view(); f.fail.add("primary"); f.advance(f.config.cacheTtlMs + 1);
  let data = await f.service.view({ profile: "primary" });
  assert.equal(data.status, "partial"); assert.equal(data.accounts[0].cache.stale, true); assert.equal(data.accounts[0].cache.refreshError, "AccessDeniedException");
  const retrieved = data.accounts[0].retrievedAt;
  const calls = f.calls(); await f.service.view({ profile: "primary" }); assert.equal(f.calls(), calls, "stale cache reads should not hammer an unavailable API");
  data = await f.service.view({ profile: "primary", refresh: true }); assert.equal(data.accounts[0].retrievedAt, retrieved);
  f.advance(f.config.cacheMaxStaleMs);
  data = await f.service.view({ profile: "primary" }); assert.equal(data.status, "unavailable"); assert.equal(data.accounts[0].error, "AccessDeniedException");
});

test("one account failure remains visible and cannot silently become a fleet total", async () => {
  const f = fixture(); f.fail.add("secondary"); const data = await f.service.view();
  assert.equal(data.status, "partial"); assert.equal(data.totalCost, 25 * 9.75); assert.equal(data.accounts[1].status, "unavailable");
  assert.equal(data.accounts[1].accountId, "222222222222");
});

test("identity mismatches and repeated AWS pagination tokens never enter the cache", async () => {
  const f = fixture();
  const badIdentity = createFinopsCostService(f.config, { clientsForScope: (scope) => ({ ...f.clientsForScope(scope), sts: { async send() { return { Account: "333333333333" }; } } }) });
  const rejected = await badIdentity.view({ profile: "primary" }); assert.equal(rejected.status, "unavailable"); assert.equal(f.calls(), 0);
  const repeated = createFinopsCostService(f.config, { clientsForScope: (scope) => ({ ...f.clientsForScope(scope), ce: { async send() { return { ResultsByTime: [], NextPageToken: "same" }; } } }) });
  assert.equal((await repeated.view()).status, "unavailable"); assert.equal(repeated.cacheStatus().entries, 0);
});

test("missing daily coverage is explicit and background refresh reports account progress", async () => {
  const f = fixture();
  const empty = createFinopsCostService(f.config, { clientsForScope: (scope) => ({ ...f.clientsForScope(scope), ce: { async send() { return { ResultsByTime: [] }; } } }), now: () => Date.parse("2026-10-26T00:00Z") });
  const data = await empty.view(); assert.equal(data.status, "partial"); assert.equal(data.accounts[0].missingDays, 25);
  f.fail.add("secondary"); await f.service.refreshAll(); const status = f.service.cacheStatus();
  assert.equal(status.completedAccounts, 2); assert.equal(status.refreshing, false); assert.equal(status.failures.length, 1); assert.ok(status.nextRefreshAt);
});

test("background scheduler warms once, schedules eight-hour refresh, and cancels its timer", async () => {
  const f = fixture(); let callback, delay, cleared = false, refreshed;
  const complete = new Promise((resolve) => { refreshed = resolve; });
  const stop = f.service.startBackgroundRefresh({ setTimer: (fn, ms) => { callback = fn; delay = ms; return 123; }, clearTimer: (id) => { cleared = id === 123; }, onRefresh: refreshed });
  await complete; assert.equal(f.calls(), 4); assert.equal(delay, 28800000); assert.equal(typeof callback, "function");
  stop(); assert.equal(cleared, true);
});

test("anomaly signals require complete history and preserve zero-baseline and estimated qualifiers", () => {
  const end = "2026-10-26", days = Array.from({ length: 35 }, (_, i) => ({ date: new Date(Date.parse(end) - (i + 1) * 86400000).toISOString().slice(0, 10), estimated: i < 7 }));
  const snapshot = { profile: "primary", accountId: "111111111111", days, cache: { stale: false }, rows: days.map((d, i) => ({ ...d, service: "Compute", amount: i < 7 ? 100 : 10 })) };
  const [signal] = costAnomalySignals([snapshot], end); assert.equal(signal.expected, 70); assert.equal(signal.actual, 700); assert.equal(signal.impact, 630); assert.equal(signal.increase, 900); assert.equal(signal.estimated, true);
  assert.equal(costAnomalySignals([{ ...snapshot, days: days.slice(1) }], end).length, 0);
  const [newSpend] = costAnomalySignals([{ ...snapshot, rows: snapshot.rows.slice(0, 7) }], end); assert.equal(newSpend.increase, null);
});

test("rollups preserve negative adjustments and never double-count accounts", () => {
  const rows = [{ profile: "primary", accountId: "111111111111", date: "2026-10-01", service: "Compute", amount: 100 }, { profile: "primary", accountId: "111111111111", date: "2026-10-01", service: "Credits", amount: -20 }];
  const data = rollupCostRows(rows, ["2026-10-01", "2026-10-02"]); assert.equal(data.totalCost, 80); assert.equal(data.accounts.length, 1); assert.deepEqual(data.trend.map((r) => r.amount), [80, 0]);
});

test("a UTC-day rollover refreshes coverage even while yesterday's snapshot TTL is fresh", async () => {
  const f = fixture(); f.advance(23 * 3600000 + 59 * 60000); await f.service.view(); assert.equal(f.calls(), 4);
  f.advance(120000); const data = await f.service.view(); assert.equal(f.calls(), 8); assert.equal(data.period.end, "2026-10-27");
});

test("cache capacity cannot publish an oversized snapshot or exceed the configured memory bound", async () => {
  const f = fixture(); const service = createFinopsCostService({ ...f.config, cacheMaxBytes: 1000 }, { clientsForScope: f.clientsForScope });
  const data = await service.view(); assert.equal(data.status, "unavailable"); assert.equal(service.cacheStatus().entries, 0); assert.equal(service.cacheStatus().bytes, 0);
});

test("reduced credits are a net cost increase even when both periods remain negative", () => {
  const end = "2026-10-26", days = Array.from({ length: 35 }, (_, i) => ({ date: new Date(Date.parse(end) - (i + 1) * 86400000).toISOString().slice(0, 10), estimated: false }));
  const snapshot = { profile: "primary", accountId: "111111111111", days, cache: { stale: false }, rows: days.map((day, i) => ({ ...day, service: "Credits", amount: i < 7 ? -1 : -10 })) };
  const [signal] = costAnomalySignals([snapshot], end); assert.equal(signal.expected, -70); assert.equal(signal.actual, -7); assert.equal(signal.impact, 63); assert.equal(signal.increase, null);
});
