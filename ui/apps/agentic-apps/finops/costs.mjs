import { parseAwsAccountList } from "../../_lib/aws-account-config.mjs";

export function finopsCostConfiguration(env = process.env) {
  const accounts = parseAwsAccountList(env.FINOPS_AWS_ACCOUNT_LIST ?? env.AWS_ACCOUNT_LIST);
  if (accounts.some((a) => !/^\d{12}$/.test(a.accountId))) throw new Error("FinOps SDK accounts require twelve-digit account IDs.");
  if (new Set(accounts.map((a) => a.accountId)).size !== accounts.length) throw new Error("Configure each billing account once to avoid double counting.");
  const cacheSeconds = Number(env.FINOPS_CACHE_TTL_SECONDS || 28800);
  if (!Number.isFinite(cacheSeconds) || cacheSeconds < 60 || cacheSeconds > 86400) throw new Error("FinOps cache lifetime must be between 60 seconds and one day.");
  const crossAccountRoleName = env.FINOPS_CROSS_ACCOUNT_ROLE_NAME || env.CROSS_ACCOUNT_ROLE_NAME || "read-only";
  if (!/^[A-Za-z0-9+=,.@_/-]{1,128}$/.test(crossAccountRoleName)) throw new Error("Invalid configured cross-account role name.");
  const partition = env.FINOPS_AWS_PARTITION || "aws";
  if (!["aws", "aws-us-gov", "aws-cn"].includes(partition)) throw new Error("Invalid AWS partition.");
  return { accounts: accounts.length ? accounts : [{ profile: "", accountId: "" }], region: env.FINOPS_AWS_REGION || "us-east-1", partition, crossAccountRoleName, cacheTtlMs: cacheSeconds * 1000, cacheMaxStaleMs: cacheSeconds * 3000, cacheMaxBytes: 64 * 1024 * 1024, backgroundRefreshEnabled: env.FINOPS_BACKGROUND_REFRESH_ENABLED !== "false" };
}

export function costPeriod(value = "month", time = Date.now()) {
  const now = new Date(time); const end = now.toISOString().slice(0, 10);
  const year = now.getUTCFullYear(), month = now.getUTCMonth();
  const iso = (date) => date.toISOString().slice(0, 10);
  if (value === "previous-month") return { key: value, label: "Previous month", start: iso(new Date(Date.UTC(year, month - 1, 1))), end: iso(new Date(Date.UTC(year, month, 1))) };
  const months = { month: 0, "3m": 2, "6m": 5, "12m": 11 };
  if (!Object.hasOwn(months, value)) throw new Error("Choose a supported cost period.");
  return { key: value, label: ({ month: "Current month", "3m": "Last 3 calendar months", "6m": "Last 6 calendar months", "12m": "Last 12 calendar months" })[value], start: iso(new Date(Date.UTC(year, month - months[value], 1))), end };
}

export function rollupCostRows(rows, dates = []) {
  const services = new Map(), accounts = new Map(), trend = new Map(dates.map((date) => [date, 0]));
  let total = 0;
  for (const row of rows) {
    total += row.amount;
    services.set(row.service, (services.get(row.service) || 0) + row.amount);
    const account = accounts.get(row.accountId) || { profile: row.profile, accountId: row.accountId, amount: 0 };
    account.amount += row.amount; accounts.set(row.accountId, account);
    trend.set(row.date, (trend.get(row.date) || 0) + row.amount);
  }
  return { totalCost: total, services: [...services].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name)), accounts: [...accounts.values()].sort((a, b) => b.amount - a.amount || a.profile.localeCompare(b.profile)), trend: [...trend].sort((a, b) => a[0].localeCompare(b[0])).map(([date, amount]) => ({ date, amount })) };
}

/** Observable spend changes; these are review signals, not causal attribution or AWS alerts. */
export function costAnomalySignals(snapshots, end, { minImpact = 25, minIncrease = 50 } = {}) {
  const offset = (days) => new Date(Date.parse(end) - days * 86400000).toISOString().slice(0, 10);
  const start = offset(7), baselineStart = offset(35); const findings = [];
  for (const snapshot of snapshots) {
    const days = new Set(snapshot.days.map((day) => day.date));
    if (Array.from({ length: 35 }, (_, i) => offset(i + 1)).some((date) => !days.has(date))) continue;
    const groups = new Map();
    for (const row of snapshot.rows) {
      if (row.date < baselineStart || row.date >= end) continue;
      const group = groups.get(row.service) || { service: row.service, actual: 0, baseline: 0 };
      if (row.date >= start) group.actual += row.amount; else group.baseline += row.amount;
      groups.set(row.service, group);
    }
    for (const row of groups.values()) {
      const expected = row.baseline / 4, impact = row.actual - expected;
      const increase = expected > 0 ? impact / expected * 100 : null;
      if (impact < minImpact || row.actual <= 0 || (increase !== null && increase < minIncrease)) continue;
      findings.push({ profile: snapshot.profile, accountId: snapshot.accountId, service: row.service, start, end, baselineStart, expected, actual: row.actual, impact, increase, estimated: snapshot.days.some((day) => day.date >= baselineStart && day.date < end && day.estimated), stale: snapshot.cache.stale });
    }
  }
  return findings.sort((a, b) => b.impact - a.impact).slice(0, 100);
}
