import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { fromNodeProviderChain, fromTemporaryCredentials, fromTokenFile } from "@aws-sdk/credential-providers";
import { createAwsScopeCredentials } from "../../_lib/aws-scope-credentials.mjs";
import { costAnomalySignals, costPeriod, rollupCostRows } from "./costs.mjs";

export function createFinopsCostClients(configuration) {
  const credentials = createAwsScopeCredentials(configuration, { fromNodeProviderChain, fromTemporaryCredentials, fromTokenFile }, { sessionName: "finops-dashboard", region: configuration.region });
  const clients = new Map();
  return (scope) => {
    if (!clients.has(scope.profile)) {
      const options = { region: configuration.region, credentials: credentials(scope), maxAttempts: 3 };
      clients.set(scope.profile, { ce: new CostExplorerClient(options), sts: new STSClient(options) });
    }
    return clients.get(scope.profile);
  };
}

/** Complete account snapshots, bounded memory/concurrency, and single-flight refreshes. */
export function createFinopsCostService(configuration, { clientsForScope = createFinopsCostClients(configuration), now = Date.now } = {}) {
  const cache = new Map(), pending = new Map(), unavailable = new Map(), waiters = [];
  let active = 0, bytes = 0, task, timer, stopped = true;
  const state = { refreshing: false, startedAt: null, completedAt: null, nextRefreshAt: null, completedAccounts: 0, totalAccounts: configuration.accounts.length, failures: [] };
  const summarize = (error) => String(error?.name && error.name !== "Error" ? error.name : error?.message || "CostExplorerUnavailable").slice(0, 160);
  const historyRange = () => { const date = new Date(now()); return { Start: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 12, 1)).toISOString().slice(0, 10), End: date.toISOString().slice(0, 10) }; };
  async function withSlot(operation) {
    if (active >= 2) await new Promise((resolve) => waiters.push(resolve));
    else active += 1;
    try { return await operation(); } finally { const next = waiters.shift(); if (next) next(); else active -= 1; }
  }
  const describe = (entry, hit, error = entry.refreshError || null) => ({ ...entry.data, cache: { hit, stale: entry.expiresAt <= now() || Boolean(error), expiresAt: new Date(entry.expiresAt).toISOString(), refreshError: error } });
  async function read(scope, { refresh = false } = {}) {
    const previous = cache.get(scope.profile), range = historyRange();
    const covers = (entry) => entry && entry.data.range.Start <= range.Start && entry.data.range.End === range.End;
    const staleUsable = previous && Date.parse(previous.data.retrievedAt) + configuration.cacheMaxStaleMs > now() && previous.data.range.Start <= range.Start;
    if (!refresh && staleUsable && previous.retryAfter > now()) return describe(previous, true);
    if (!refresh && covers(previous) && previous.expiresAt > now() && !previous.refreshError) return describe(previous, true);
    if (pending.has(scope.profile)) return pending.get(scope.profile);
    const failure = unavailable.get(scope.profile);
    if (!refresh && failure?.retryAfter > now()) throw new Error(failure.error);
    const operation = withSlot(async () => {
      try {
        const { ce, sts } = clientsForScope(scope);
        const identity = await sts.send(new GetCallerIdentityCommand({}), { abortSignal: AbortSignal.timeout(30000) });
        if (!/^\d{12}$/.test(identity.Account) || (scope.accountId && identity.Account !== scope.accountId)) throw new Error("AWS account identity does not match the configured scope.");
        const rows = [], days = new Map(), rowKeys = new Set(), tokens = new Set();
        let token, pages = 0;
        do {
          const result = await ce.send(new GetCostAndUsageCommand({ TimePeriod: range, Granularity: "DAILY", Metrics: ["UnblendedCost"], Filter: { Dimensions: { Key: "LINKED_ACCOUNT", Values: [identity.Account] } }, GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }], ...(token ? { NextPageToken: token } : {}) }), { abortSignal: AbortSignal.timeout(60000) });
          if (!Array.isArray(result.ResultsByTime)) throw new Error("Cost Explorer returned no daily coverage.");
          for (const bucket of result.ResultsByTime) {
            const date = bucket.TimePeriod?.Start;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || date < range.Start || date >= range.End || bucket.TimePeriod?.End !== new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10) || typeof bucket.Estimated !== "boolean" || !Array.isArray(bucket.Groups)) throw new Error("Invalid Cost Explorer daily bucket.");
            days.set(date, { date, estimated: Boolean(days.get(date)?.estimated || bucket.Estimated) });
            for (const group of bucket.Groups) {
              const service = group.Keys?.[0], metric = group.Metrics?.UnblendedCost;
              if (group.Keys?.length !== 1 || typeof service !== "string" || !service || service.length > 400 || metric?.Unit !== "USD" || typeof metric.Amount !== "string" || !metric.Amount.trim() || !Number.isFinite(Number(metric.Amount))) throw new Error("Invalid Cost Explorer service cost.");
              const key = date + "\u0000" + service;
              if (rowKeys.has(key)) throw new Error("Cost Explorer repeated a daily service row.");
              rowKeys.add(key); rows.push({ profile: scope.profile, accountId: identity.Account, date, service, amount: Number(metric.Amount), estimated: bucket.Estimated });
            }
            if (!bucket.Groups.length && Number(bucket.Total?.UnblendedCost?.Amount || 0) !== 0) throw new Error("Cost Explorer omitted a nonzero service allocation.");
          }
          pages += 1; token = result.NextPageToken;
          if (token && (typeof token !== "string" || token.length > 8192 || tokens.has(token))) throw new Error("Cost Explorer returned a repeated or invalid page token.");
          if (token) tokens.add(token);
          if (pages >= 200 || rows.length > 50000) { if (token || rows.length > 50000) throw new Error("Cost Explorer exceeded the snapshot limit; no incomplete snapshot was saved."); }
        } while (token);
        const data = { profile: scope.profile, accountId: identity.Account, range, rows, days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), retrievedAt: new Date(now()).toISOString(), pages };
        const size = Buffer.byteLength(JSON.stringify(data));
        if (size > configuration.cacheMaxBytes) throw new Error("Cost Explorer snapshot exceeds cache capacity.");
        const replaced = cache.get(scope.profile);
        if (replaced) { bytes -= replaced.bytes; cache.delete(scope.profile); }
        while (cache.size && bytes + size > configuration.cacheMaxBytes) { const key = cache.keys().next().value; bytes -= cache.get(key).bytes; cache.delete(key); }
        const entry = { data, bytes: size, expiresAt: now() + configuration.cacheTtlMs };
        cache.set(scope.profile, entry); bytes += size; unavailable.delete(scope.profile);
        return describe(entry, false);
      } catch (error) {
        unavailable.set(scope.profile, { error: summarize(error), retryAfter: now() + Math.min(300000, configuration.cacheTtlMs) });
        if (previous && Date.parse(previous.data.retrievedAt) + configuration.cacheMaxStaleMs > now() && previous.data.range.Start <= range.Start) {
          previous.refreshError = summarize(error); previous.retryAfter = now() + Math.min(300000, configuration.cacheTtlMs);
          return describe(previous, true);
        }
        throw error;
      }
    });
    pending.set(scope.profile, operation);
    try { return await operation; } finally { pending.delete(scope.profile); }
  }
  async function view({ profile = "*", period = "month", refresh = false } = {}) {
    const selected = profile === "*" ? configuration.accounts : configuration.accounts.filter((a) => (a.profile || "@default") === profile);
    if (!selected.length) throw new Error("Choose a configured AWS account.");
    const range = costPeriod(period, now());
    const results = await Promise.all(selected.map(async (scope) => { try { return { snapshot: await read(scope, { refresh }) }; } catch (error) { return { profile: scope.profile, accountId: scope.accountId, error: summarize(error) }; } }));
    const snapshots = results.filter((r) => r.snapshot).map((r) => r.snapshot);
    const rows = snapshots.flatMap((s) => s.rows.filter((r) => r.date >= range.start && r.date < range.end));
    const dates = [...new Set(snapshots.flatMap((s) => s.days.filter((d) => d.date >= range.start && d.date < range.end).map((d) => d.date)))].sort();
    const expectedDays = Math.max(0, (Date.parse(range.end) - Date.parse(range.start)) / 86400000);
    const accounts = results.map((r) => r.snapshot ? { profile: r.snapshot.profile, accountId: r.snapshot.accountId, status: "ready", missingDays: Math.max(0, expectedDays - r.snapshot.days.filter((d) => d.date >= range.start && d.date < range.end).length), retrievedAt: r.snapshot.retrievedAt, range: r.snapshot.range, cache: r.snapshot.cache, pages: r.snapshot.pages, estimated: r.snapshot.days.some((d) => d.date >= range.start && d.date < range.end && d.estimated) } : { profile: r.profile, accountId: r.accountId, status: "unavailable", error: r.error });
    return { source: "aws-cost-explorer-sdk", metric: "UnblendedCost", currency: "USD", period: range, status: snapshots.length === selected.length && snapshots.every((s) => !s.cache.stale) && accounts.every((a) => a.missingDays === 0) ? "ready" : snapshots.length ? "partial" : "unavailable", ...rollupCostRows(rows, dates), accounts, rows, dates, anomalies: costAnomalySignals(snapshots, range.end), cache: cacheStatus() };
  }
  async function refreshAll() {
    if (task) return task;
    task = (async () => {
      Object.assign(state, { refreshing: true, startedAt: new Date(now()).toISOString(), completedAccounts: 0, failures: [] });
      await Promise.all(configuration.accounts.map(async (scope) => {
        try { const data = await read(scope, { refresh: true }); if (data.cache.refreshError) state.failures.push({ profile: scope.profile, error: data.cache.refreshError }); }
        catch (error) { state.failures.push({ profile: scope.profile, error: summarize(error) }); }
        finally { state.completedAccounts += 1; }
      }));
      state.refreshing = false; state.completedAt = new Date(now()).toISOString();
      state.nextRefreshAt = new Date(now() + (state.failures.length ? Math.min(300000, configuration.cacheTtlMs) : configuration.cacheTtlMs)).toISOString();
    })();
    try { await task; } finally { task = null; }
  }
  function cacheStatus() { return { ...state, failures: [...state.failures], enabled: configuration.backgroundRefreshEnabled, ttlMs: configuration.cacheTtlMs, maxStaleMs: configuration.cacheMaxStaleMs, entries: cache.size, bytes, inFlight: pending.size }; }
  function startBackgroundRefresh({ setTimer = setTimeout, clearTimer = clearTimeout, onRefresh = () => {} } = {}) {
    stopped = false;
    const tick = async () => {
      await refreshAll(); onRefresh(cacheStatus());
      if (!stopped) { timer = setTimer(tick, Math.max(1000, Date.parse(state.nextRefreshAt) - now())); timer?.unref?.(); }
    };
    void tick();
    return () => { stopped = true; clearTimer(timer); };
  }
  return { read, view, refreshAll, cacheStatus, startBackgroundRefresh };
}
