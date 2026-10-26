/** Bounded, single-flight tag snapshots. Warm reads remain available during refresh. */
export function createInfrastructureSourceCache({ scopes, enabled, loadScope, ttlMs = 28800000, now = Date.now, maxBytes = 64 * 1024 * 1024 }) {
  const snapshots = new Map(), failures = new Map(), pending = new Map(), queue = [];
  let active = 0, bytes = 0, cycle, timer, stopped = true;
  const key = (scope) => scope.profile + ":" + scope.region;
  const errorCode = (error) => /^[A-Za-z0-9]+$/.test(error?.name || "") && error.name !== "Error" ? error.name : "ResourceDiscoveryUnavailable";
  async function pull(scope) {
    const id = key(scope);
    if (pending.has(id)) return pending.get(id);
    const task = (async () => {
      if (active >= 2) await new Promise((resolve) => queue.push(resolve)); else active += 1;
      try {
        const data = await loadScope(scope), size = Buffer.byteLength(JSON.stringify(data));
        const old = snapshots.get(id);
        if (size > maxBytes || bytes - (old?.bytes || 0) + size > maxBytes) throw new Error("Source cache capacity exceeded.");
        bytes += size - (old?.bytes || 0);
        snapshots.set(id, { ...data, bytes: size, retrievedAt: new Date(now()).toISOString() });
        failures.delete(id);
      } catch (error) { failures.set(id, { code: errorCode(error), retryAt: now() + Math.min(ttlMs, 300000) }); }
      finally { const next = queue.shift(); if (next) next(); else active -= 1; }
    })();
    pending.set(id, task);
    try { await task; } finally { pending.delete(id); }
  }
  async function refresh() {
    if (!enabled) return;
    if (!cycle) cycle = Promise.all(scopes.map(pull)).finally(() => { cycle = null; });
    await cycle;
  }
  async function view({ profiles, service = "", search = "", page = 1, force = false } = {}) {
    if (!Number.isInteger(page) || page < 1 || page > 100000 || typeof search !== "string" || search.length > 256 || typeof service !== "string" || service.length > 400) throw new Error("Invalid infrastructure source filters.");
    if (force) await refresh();
    const selected = scopes.filter((scope) => !profiles || profiles.includes(scope.profile));
    if (enabled && !force) {
      const reads = selected.filter((scope) => (!snapshots.has(key(scope)) || Date.parse(snapshots.get(key(scope)).retrievedAt) + ttlMs <= now()) && !(failures.get(key(scope))?.retryAt > now())).map(pull);
      // Cold reads wait once; warm reads serve immediately while a shared refresh runs.
      if (!selected.some((scope) => snapshots.has(key(scope)))) await Promise.all(reads);
    }
    const coverage = selected.map((scope) => {
      const snapshot = snapshots.get(key(scope)), age = snapshot ? now() - Date.parse(snapshot.retrievedAt) : Infinity;
      const usable = age < ttlMs * 3;
      return { profile: scope.profile, accountId: scope.accountId, region: scope.region, status: !enabled ? "disabled" : !usable ? "unavailable" : failures.has(key(scope)) || age >= ttlMs ? "stale" : "ready", retrievedAt: snapshot?.retrievedAt || null, pages: usable ? snapshot.pages : null, error: failures.get(key(scope))?.code || null };
    });
    const resources = new Map();
    for (let i = 0; i < selected.length; i++) {
      if (!["ready", "stale"].includes(coverage[i].status)) continue;
      for (const resource of snapshots.get(key(selected[i])).resources) {
        if (service && !resource.costServices.includes(service)) continue;
        if (search && ![resource.name, resource.arn, resource.source.repository, resource.source.owner, resource.source.workspace, resource.source.path].join(" ").toLowerCase().includes(search.toLowerCase())) continue;
        const id = resource.accountId + ":" + resource.arn;
        resources.set(id, { ...resource, stale: coverage[i].status === "stale" });
      }
    }
    const rows = [...resources.values()].sort((a, b) => a.name.localeCompare(b.name) || a.arn.localeCompare(b.arn));
    const pages = Math.max(1, Math.ceil(rows.length / 20)), current = Math.min(page, pages);
    return { enabled, resources: rows.slice((current - 1) * 20, current * 20), total: rows.length, associated: rows.filter((r) => r.source.status === "tag-provided").length, page: current, pages, coverage, refreshing: pending.size > 0, ttlMs, bytes, status: !enabled ? "disabled" : coverage.every((c) => c.status === "ready") ? "ready" : coverage.some((c) => ["ready", "stale"].includes(c.status)) ? "partial" : "unavailable" };
  }
  function startBackgroundRefresh() {
    stopped = false;
    const tick = async () => { await refresh(); if (!stopped) { timer = setTimeout(tick, failures.size ? Math.min(ttlMs, 300000) : ttlMs); timer.unref?.(); } };
    if (enabled) void tick();
    return () => { stopped = true; clearTimeout(timer); };
  }
  return { view, refresh, startBackgroundRefresh };
}
