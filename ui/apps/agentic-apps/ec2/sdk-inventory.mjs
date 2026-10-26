import { EC2Client, DescribeInstancesCommand, DescribeInstanceTypesCommand } from "@aws-sdk/client-ec2";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { SSMClient, DescribeInstanceInformationCommand } from "@aws-sdk/client-ssm";
import { PricingClient, GetProductsCommand } from "@aws-sdk/client-pricing";
import { fromNodeProviderChain, fromTemporaryCredentials, fromTokenFile } from "@aws-sdk/credential-providers";

import { createAwsScopeCredentials } from "../../_lib/aws-scope-credentials.mjs";

const EIGHT_HOURS = 8 * 60 * 60 * 1000;
const errorSummary = (error) => String(error?.name || "AWS request failed").slice(0, 160);
const gpuPresent = (type) => type ? Boolean(type.GpuInfo?.Gpus?.length || type.GpuInfo?.TotalGpuMemoryInMiB > 0) : null;

/** Only configured account IDs become role ARNs; browser profile names never select local credentials. */
export function createAwsScopeClients(configuration) {
  const credentials = createAwsScopeCredentials(configuration, { fromNodeProviderChain, fromTemporaryCredentials, fromTokenFile }, { sessionName: "ec2-dashboard", region: process.env.AWS_REGION || configuration.regions[0] });
  const clients = new Map();
  return (scope) => {
    const key = scope.profile + ":" + scope.region;
    if (clients.has(key)) return clients.get(key);
    const options = { region: scope.region, credentials: credentials(scope), maxAttempts: 3 };
    const value = { ec2: new EC2Client(options), sts: new STSClient(options), ssm: new SSMClient(options), pricing: new PricingClient({ ...options, region: "us-east-1" }) };
    clients.set(key, value);
    return value;
  };
}

/** Full SDK pagination, bounded concurrency, shared single-flight reads, and expiring snapshots. */
export function createAwsInventoryService(configuration, { clientsForScope = createAwsScopeClients(configuration), now = Date.now } = {}) {
  const snapshots = new Map();
  const pending = new Map();
  const scopeVersions = new Map();
  const lookups = new Map();
  const lookupPending = new Map();
  const waiters = [];
  let active = 0;
  let cacheBytes = 0;
  const ttl = configuration.cacheTtlMs || EIGHT_HOURS;
  const maxBytes = configuration.cacheMaxBytes || 64 * 1024 * 1024;
  const maxStale = configuration.cacheMaxStaleMs || ttl * 3;
  let refreshTask;
  let backgroundTimer;
  let backgroundStopped = true;
  const refreshState = { refreshing: false, startedAt: null, completedAt: null, nextRefreshAt: null, totalScopes: configuration.accounts.length * configuration.regions.length, completedScopes: 0, failures: [] };


  async function withSlot(operation) {
    if (active >= 2) await new Promise((resolve) => waiters.push(resolve));
    active += 1;
    try { return await operation(); }
    finally { active -= 1; waiters.shift()?.(); }
  }
  function remember(key, data) {
    const bytes = Buffer.byteLength(JSON.stringify(data));
    const previous = snapshots.get(key);
    if (previous) cacheBytes -= previous.bytes;
    snapshots.delete(key);
    while (snapshots.size && cacheBytes + bytes > maxBytes) {
      const oldest = snapshots.keys().next().value;
      cacheBytes -= snapshots.get(oldest).bytes;
      snapshots.delete(oldest);
    }
    if (bytes <= maxBytes) { snapshots.set(key, { data, bytes, expiresAt: Date.parse(data.retrievedAt) + ttl }); cacheBytes += bytes; }
  }
  async function lookup(key, operation, refresh) {
    const cached = lookups.get(key);
    if (!refresh && cached && cached.expiresAt > now() + 90_000) return cached;
    if (lookupPending.has(key)) return lookupPending.get(key);
    const task = (async () => {
      const value = await operation();
      const result = { value, fetchedAt: now(), expiresAt: now() + ttl };
      if (lookups.size >= 2048) lookups.delete(lookups.keys().next().value);
      lookups.set(key, result);
      return result;
    })();
    lookupPending.set(key, task);
    try { return await task; } finally { lookupPending.delete(key); }
  }
  async function read(scope, { cursor = "", instanceId = "", refresh = false } = {}) {
    const scopeKey = scope.profile + ":" + scope.region;
    const version = scopeVersions.get(scopeKey) || 0;
    const key = JSON.stringify([scope.profile, scope.region, cursor, instanceId]);
    const pendingKey = key + ":" + version;
    let cached = snapshots.get(key);
    let cachedData = cached?.data;
    let cachedKey = key;
    let sourceCursor = cursor;
    let sourceInstanceId = instanceId;
    if (instanceId && !refresh) {
      let token = ""; let oldest = Infinity; const seen = new Set();
      do {
        const fleetKey = JSON.stringify([scope.profile, scope.region, token, ""]);
        const entry = snapshots.get(fleetKey);
        if (!entry || Date.parse(entry.data.retrievedAt) + maxStale <= now()) break;
        oldest = Math.min(oldest, Date.parse(entry.data.retrievedAt));
        const matches = entry.data.instances.filter((row) => row.instanceId === instanceId);
        if (matches.length || !entry.data.nextToken) {
          const retrievedAt = matches.length ? entry.data.retrievedAt : new Date(oldest).toISOString();
          if (!cached || Date.parse(retrievedAt) >= Date.parse(cached.data.retrievedAt)) {
            cached = entry; cachedKey = fleetKey; sourceCursor = token; sourceInstanceId = "";
            cachedData = { ...entry.data, retrievedAt, instances: matches, complete: true, nextToken: null, status: "ready" };
          }
          break;
        }
        token = entry.data.nextToken;
        if (seen.has(token)) break;
        seen.add(token);
      } while (seen.size < 200);
    }
    if (!refresh && cached && Date.parse(cachedData.retrievedAt) + maxStale > now()) {
      snapshots.delete(cachedKey); snapshots.set(cachedKey, cached);
      const expiresAt = Date.parse(cachedData.retrievedAt) + ttl;
      const stale = expiresAt <= now();
      if (stale && !pending.has(cachedKey + ":" + version) && !refreshState.refreshing) void read(scope, { cursor: sourceCursor, instanceId: sourceInstanceId, refresh: true }).catch((error) => { cached.lastError = errorSummary(error); });
      return { ...cachedData, cache: { hit: true, stale, refreshing: pending.has(cachedKey + ":" + version) || refreshState.refreshing, refreshError: cached.lastError || null, expiresAt: new Date(expiresAt).toISOString() } };
    }
    if (pending.has(pendingKey)) return pending.get(pendingKey);
    const task = withSlot(async () => {
      try {
        const data = await fetchScope(scope, { cursor, instanceId, refresh });
        if ((scopeVersions.get(scopeKey) || 0) === version) remember(key, data);
        return { ...data, cache: { hit: false, stale: false, refreshing: false, refreshError: null, expiresAt: new Date(Date.parse(data.retrievedAt) + ttl).toISOString() } };
      } catch (error) {
        if (cached) cached.lastError = errorSummary(error);
        throw error;
      }
    });
    pending.set(pendingKey, task);
    try { return await task; } finally { pending.delete(pendingKey); }
  }
  function invalidateScope(scope) {
    const scopeKey = scope.profile + ":" + scope.region;
    scopeVersions.set(scopeKey, (scopeVersions.get(scopeKey) || 0) + 1);
    for (const [key, entry] of snapshots) {
      const [profile, region] = JSON.parse(key);
      if (profile === scope.profile && region === scope.region) { snapshots.delete(key); cacheBytes -= entry.bytes; }
    }
  }
  function cacheStatus() {
    return { ...refreshState, enabled: !backgroundStopped, failures: refreshState.failures.map((failure) => ({ ...failure })), refreshIntervalMs: ttl, maxStaleMs: maxStale, entries: snapshots.size, bytes: cacheBytes };
  }
  async function refreshAll() {
    if (refreshTask) return refreshTask;
    refreshState.refreshing = true; refreshState.startedAt = new Date(now()).toISOString(); refreshState.completedScopes = 0; refreshState.failures = [];
    refreshState.nextRefreshAt = new Date(now() + ttl).toISOString();
    const queue = configuration.accounts.flatMap((account) => configuration.regions.map((region) => ({ profile: account.profile, accountId: account.accountId || null, region })));
    refreshTask = (async () => {
      const worker = async () => {
        while (queue.length) {
          const scope = queue.shift();
          const scopeVersion = scopeVersions.get(scope.profile + ":" + scope.region) || 0;
          const belongsToScope = (key) => { const [profile, region, , instanceId] = JSON.parse(key); return profile === scope.profile && region === scope.region && !instanceId; };
          const previous = new Map([...snapshots].filter(([key]) => belongsToScope(key)));
          const written = new Map();
          try {
            let cursor = ""; let batches = 0; const seen = new Set();
            do {
              const data = await read(scope, { cursor, refresh: true });
              if ((scopeVersions.get(scope.profile + ":" + scope.region) || 0) !== scopeVersion) throw new Error("InventoryChangedDuringRefresh");
              const key = JSON.stringify([scope.profile, scope.region, cursor, ""]); written.set(key, snapshots.get(key));
              cursor = data.nextToken || ""; batches += 1;
              if (cursor && (seen.has(cursor) || batches >= 200)) throw new Error("InventoryPaginationIncomplete");
              if (cursor) seen.add(cursor);
            } while (cursor);
          } catch (error) {
            if (previous.size && (scopeVersions.get(scope.profile + ":" + scope.region) || 0) === scopeVersion) {
              for (const [key, entry] of written) {
                if (!entry || snapshots.get(key) !== entry) continue;
                snapshots.delete(key); cacheBytes -= entry.bytes;
                const old = previous.get(key);
                if (old) { remember(key, old.data); const restored = snapshots.get(key); if (restored) restored.lastError = errorSummary(error); }
              }
            }
            refreshState.failures.push({ profile: scope.profile, region: scope.region, error: errorSummary(error) });
          }
          refreshState.completedScopes += 1;
        }
      };
      try { await Promise.all([worker(), worker()]); }
      finally { refreshState.refreshing = false; refreshState.completedAt = new Date(now()).toISOString(); refreshTask = null; }
      return cacheStatus();
    })();
    return refreshTask;
  }
  function startBackgroundRefresh({ setTimer = setTimeout, clearTimer = clearTimeout, onRefresh = () => {} } = {}) {
    if (!backgroundStopped) return () => {};
    backgroundStopped = false;
    const run = async () => {
      if (backgroundStopped) return;
      const result = await refreshAll(); onRefresh(result);
      if (backgroundStopped) return;
      const delay = refreshState.failures.length ? Math.min(ttl, 5 * 60_000) : Math.max(1000, Date.parse(refreshState.nextRefreshAt) - now());
      refreshState.nextRefreshAt = new Date(now() + delay).toISOString();
      backgroundTimer = setTimer(() => { void run(); }, delay); backgroundTimer?.unref?.();
    };
    void run();
    return () => { backgroundStopped = true; clearTimer(backgroundTimer); refreshState.nextRefreshAt = null; };
  }
  async function fetchScope(scope, { cursor, instanceId, refresh }) {
    const clients = clientsForScope(scope);
    const evidence = [];
    const warnings = new Set();
    const sourceTimes = [now()];
    const signal = AbortSignal.timeout(90_000);
    async function send(client, command, service, region = scope.region) {
      const result = await client.send(command, { abortSignal: signal });
      evidence.push({ service, operation: command.constructor.name.replace(/Command$/, ""), region, requestId: result.$metadata?.requestId || null });
      return result;
    }
    const identity = await send(clients.sts, new GetCallerIdentityCommand({}), "sts");
    if (!/^\d{12}$/.test(identity.Account || "") || (scope.accountId && scope.accountId !== identity.Account)) throw new Error("AWS account identity does not match the configured scope.");
    const raw = [];
    const seenIds = new Set();
    const seenTokens = new Set();
    let nextToken = cursor || undefined;
    let pages = 0;
    do {
      let page;
      try {
        page = await send(clients.ec2, new DescribeInstancesCommand(instanceId ? { InstanceIds: [instanceId] } : { MaxResults: 100, ...(nextToken ? { NextToken: nextToken } : {}) }), "ec2");
      } catch (error) {
        if (instanceId && error?.name === "InvalidInstanceID.NotFound") { nextToken = undefined; break; }
        if (!pages) throw error;
        warnings.add("Inventory is incomplete: " + errorSummary(error) + ". Retry the remaining AWS pages.");
        break;
      }
      pages += 1;
      for (const reservation of page.Reservations || []) {
        if (reservation.OwnerId !== identity.Account) throw new Error("EC2 reservation identity does not match STS.");
        for (const item of reservation.Instances || []) if (item.InstanceId && !seenIds.has(item.InstanceId)) {
          if (instanceId && item.InstanceId !== instanceId) throw new Error("AWS returned a different instance.");
          seenIds.add(item.InstanceId); raw.push(item);
        }
      }
      nextToken = page.NextToken;
      if (nextToken && seenTokens.has(nextToken)) throw new Error("AWS repeated an inventory pagination token.");
      if (nextToken) seenTokens.add(nextToken);
      if (pages >= 200 || raw.length >= 10_000) { if (nextToken) warnings.add("The bounded inventory batch is full; load the remaining AWS pages to continue."); break; }
    } while (nextToken && !instanceId);

    const typeMap = new Map();
    const types = [...new Set(raw.map((row) => row.InstanceType).filter(Boolean))];
    for (let offset = 0; offset < types.length; offset += 100) {
      const names = types.slice(offset, offset + 100);
      try {
        const result = await lookup("types:" + scope.profile + ":" + scope.region + ":" + [...names].sort().join(","), async () => {
          const items = []; let token;
          do { const page = await send(clients.ec2, new DescribeInstanceTypesCommand({ InstanceTypes: names, ...(token ? { NextToken: token } : {}) }), "ec2"); items.push(...(page.InstanceTypes || [])); token = page.NextToken; } while (token && items.length < 1000);
          return items;
        }, refresh);
        sourceTimes.push(result.fetchedAt);
        for (const item of result.value) typeMap.set(item.InstanceType, item);
      } catch (error) {
        // A terminated instance can reference a type no longer offered in this region.
        // Isolate that type so valid instances retain their hardware metadata.
        if (error?.name === "InvalidInstanceType" && names.length > 1) {
          const queue = [...names];
          const worker = async () => {
            while (queue.length) {
              const name = queue.shift();
              try {
                const result = await lookup("type:" + scope.profile + ":" + scope.region + ":" + name, async () => (await send(clients.ec2, new DescribeInstanceTypesCommand({ InstanceTypes: [name] }), "ec2")).InstanceTypes || [], refresh);
                sourceTimes.push(result.fetchedAt);
                for (const item of result.value) typeMap.set(item.InstanceType, item);
              } catch (lookupError) { warnings.add("Some instance hardware metadata is unavailable: " + errorSummary(lookupError)); }
            }
          };
          await Promise.all([worker(), worker()]);
        } else warnings.add("Instance size/CPU/GPU metadata unavailable: " + errorSummary(error));
      }
    }
    const osMap = new Map();
    if (raw.length) try {
      const result = await lookup("ssm:" + scope.profile + ":" + scope.region, async () => {
        const items = []; let token; let count = 0;
        do {
          const page = await send(clients.ssm, new DescribeInstanceInformationCommand({ MaxResults: 50, ...(token ? { NextToken: token } : {}), Filters: [{ Key: "ResourceType", Values: ["EC2Instance"] }] }), "ssm");
          items.push(...(page.InstanceInformationList || [])); token = page.NextToken; count += 1;
        } while (token && count < 200);
        if (token) warnings.add("SSM OS coverage is incomplete.");
        return items;
      }, refresh);
      sourceTimes.push(result.fetchedAt);
      for (const item of result.value) osMap.set(item.InstanceId, [item.PlatformName, item.PlatformVersion].filter(Boolean).join(" ") || null);
    } catch (error) { warnings.add("SSM OS versions unavailable: " + errorSummary(error)); }

    const prices = new Map();
    const combinations = [...new Map(raw.filter((row) => row.Placement?.Tenancy === "default" && ["Linux/UNIX", "Windows"].includes(row.PlatformDetails)).map((row) => [row.InstanceType + ":" + row.PlatformDetails, row])).entries()];
    if (combinations.length > 100) warnings.add("Only the first 100 distinct type/OS price combinations are enriched; other prices remain unknown.");
    const priceQueue = combinations.slice(0, 100);
    const priceWorker = async () => {
      while (priceQueue.length) {
        const [key, row] = priceQueue.shift();
        const os = row.PlatformDetails === "Windows" ? "Windows" : "Linux";
        try {
          const result = await lookup("price:" + scope.region + ":" + key, async () => {
            const page = await send(clients.pricing, new GetProductsCommand({ ServiceCode: "AmazonEC2", MaxResults: 100, Filters: Object.entries({ regionCode: scope.region, instanceType: row.InstanceType, operatingSystem: os, tenancy: "Shared", preInstalledSw: "NA", capacitystatus: "Used" }).map(([Field, Value]) => ({ Type: "TERM_MATCH", Field, Value })) }), "pricing", "us-east-1");
            if (page.NextToken) return null;
            const candidates = [];
            for (const entry of page.PriceList || []) {
              const product = typeof entry?.deserializeJSON === "function" ? entry.deserializeJSON() : typeof entry === "string" ? JSON.parse(entry) : entry;
              const attrs = product?.product?.attributes || {};
              if (attrs.regionCode !== scope.region || attrs.instanceType !== row.InstanceType || attrs.operatingSystem !== os || attrs.tenancy !== "Shared" || attrs.preInstalledSw !== "NA" || attrs.capacitystatus !== "Used") continue;
              for (const term of Object.values(product.terms?.OnDemand || {})) for (const rate of Object.values(term.priceDimensions || {})) {
                const usd = rate.pricePerUnit?.USD;
                if (typeof product.product.sku === "string" && rate.unit === "Hrs" && rate.beginRange === "0" && rate.endRange === "Inf" && typeof usd === "string" && usd.trim() && Number.isFinite(Number(usd)) && Number(usd) >= 0) candidates.push({ hourlyUsd: Number(usd), sku: product.product.sku, instanceType: row.InstanceType, region: scope.region, operatingSystem: os, tenancy: "Shared", unit: "Hrs" });
              }
            }
            return candidates.length === 1 ? candidates[0] : null;
          }, refresh);
          sourceTimes.push(result.fetchedAt); prices.set(key, result.value);
          if (!result.value) warnings.add("Some on-demand rates could not be uniquely resolved and remain unknown.");
        } catch (error) { warnings.add("Some on-demand rates are unavailable: " + errorSummary(error)); }
      }
    };
    await Promise.all([priceWorker(), priceWorker()]);
    const retrievedAt = new Date(Math.min(...sourceTimes)).toISOString();
    const instances = raw.map((row) => {
      const type = typeMap.get(row.InstanceType);
      const tags = (row.Tags || []).map((tag) => ({ key: String(tag.Key || ""), value: String(tag.Value || "") }));
      return { instanceId: row.InstanceId, name: tags.find((tag) => tag.key === "Name")?.value || null, instanceType: row.InstanceType, state: row.State?.Name || "unknown", platform: row.PlatformDetails || null, osVersion: osMap.get(row.InstanceId) || null, architecture: row.Architecture || null, tenancy: row.Placement?.Tenancy || null, lifecycle: row.InstanceLifecycle || null, launchTime: row.LaunchTime ? new Date(row.LaunchTime).toISOString() : null, vcpu: type?.VCpuInfo?.DefaultVCpus ?? null, memoryGiB: type?.MemoryInfo?.SizeInMiB ? type.MemoryInfo.SizeInMiB / 1024 : null, cpuManufacturer: type?.ProcessorInfo?.Manufacturer || null, gpu: gpuPresent(type), tagCount: tags.length, tags, pricing: prices.get(row.InstanceType + ":" + row.PlatformDetails) || null, accountId: identity.Account, profile: scope.profile, region: scope.region, retrievedAt };
    });
    return { status: nextToken ? "partial" : "ready", source: "aws-sdk", profile: scope.profile, accountId: identity.Account, region: scope.region, retrievedAt, complete: !nextToken, nextToken: nextToken || null, pages, instances, warnings: [...warnings], evidence };
  }
  return { read, invalidateScope, refreshAll, cacheStatus, startBackgroundRefresh, clear: () => { snapshots.clear(); lookups.clear(); cacheBytes = 0; } };
}
