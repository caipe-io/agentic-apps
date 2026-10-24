import { createHash } from "node:crypto";

const DAY_MS = 86_400_000;
const METRICS = ["spend", "inputTokens", "outputTokens", "totalTokens", "requests", "cacheReadTokens", "cacheWriteTokens"];

/** Compare completed UTC days with the four preceding weeks, matching weekdays. */
export function resolveLiteLlmAnomalyRange(days = 7, now = new Date()) {
  const windowDays = [1, 3, 4, 7, 14].includes(Number(days)) ? Number(days) : 7;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = today - DAY_MS;
  const start = today - windowDays * DAY_MS;
  return {
    windowDays,
    startDate: dateString(start),
    endDate: dateString(end),
    baselineStartDate: dateString(start - 28 * DAY_MS),
    baselineEndDate: dateString(start - DAY_MS),
    baselineDays: 28,
  };
}

export function buildLiteLlmAnomalyReport({ response, range, minImpactUsd = 25, minIncreasePercent = 50 }) {
  if (!Array.isArray(response?.results) || response.metadata?.has_more || Number(response.metadata?.total_pages) > 1) {
    throw new Error("Incomplete activity response for anomaly analysis");
  }
  const impactThreshold = threshold(minImpactUsd, 25, 1_000_000);
  const increaseThreshold = threshold(minIncreasePercent, 50, 10_000);
  const baselineDates = datesBetween(range.baselineStartDate, range.baselineEndDate);
  const analysisDates = datesBetween(range.startDate, range.endDate);
  const dates = new Map();
  const models = new Set();
  const warnings = [];
  for (const day of response.results) {
    if (!day || typeof day !== "object") throw new Error("Invalid activity date");
    const date = day.date ?? day.start_date ?? day.day;
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid activity date");
    if (date < range.baselineStartDate || date > range.endDate) continue;
    if (dates.has(date)) throw new Error("Duplicate aggregated activity date");
    const breakdown = day.breakdown?.models ?? day.models;
    const dailyModels = new Map();
    const metrics = readMetrics(day.metrics ?? day);
    // Missing activity is not evidence of zero spend. Only an explicitly empty day
    // can establish that an absent model had no traffic on that date.
    const explicitZero = metrics.spend === 0 && metrics.totalTokens === 0 && metrics.requests === 0;
    if ((!breakdown || typeof breakdown !== "object" || Array.isArray(breakdown)) && !explicitZero) {
      warnings.push("Model breakdown missing for " + date + ".");
      continue;
    }
    for (const [name, value] of Object.entries(breakdown ?? {})) {
      if (!value || typeof value !== "object") throw new Error("Invalid model activity");
      models.add(name);
      dailyModels.set(name, readMetrics(value.metrics ?? value));
    }
    // Truncated model lists must not create false new-usage or spend-spike signals.
    const knownSpend = [...dailyModels.values()].reduce((sum, row) => sum + (row.spend ?? 0), 0);
    if (metrics.spend === null || Math.abs(knownSpend - metrics.spend) > Math.max(0.01, Math.abs(metrics.spend) * 0.000001)) {
      warnings.push("Model spend does not reconcile with the gateway total for " + date + ".");
      continue;
    }
    dates.set(date, dailyModels);
  }

  const missingDates = [...baselineDates, ...analysisDates].filter((date) => !dates.has(date));
  const complete = missingDates.length === 0;
  const report = {
    generatedAt: new Date().toISOString(),
    source: "/user/daily/activity/aggregated",
    scope: "gateway",
    range,
    thresholds: { minImpactUsd: impactThreshold, minIncreasePercent: increaseThreshold },
    methodology: "Expected usage is the sum of per-model weekday means from the preceding 28 completed UTC days (four observations per weekday). Current UTC day is excluded. A spend spike must meet both the dollar-impact and percentage thresholds. New spend with a zero-spend baseline requires the dollar-impact threshold and is labeled separately.",
    coverage: { baselineDays: baselineDates.filter((date) => dates.has(date)).length, analysisDays: analysisDates.filter((date) => dates.has(date)).length, missingDates },
    status: complete ? "ready" : "insufficient_history",
    analyzedModels: models.size,
    findings: [],
    excludedModels: [],
    warnings,
  };
  if (!complete) {
    report.warnings.push("All 28 baseline days and every analysis day must have reconcilable model activity. Missing dates may reflect inactivity, retention, or incomplete reporting; no zero usage was inferred.");
    return report;
  }

  const zero = Object.fromEntries(METRICS.map((metric) => [metric, 0]));
  for (const model of [...models].sort()) {
    const metricsOn = (date) => dates.get(date).get(model) ?? zero;
    const history = baselineDates.map(metricsOn);
    const current = analysisDates.map(metricsOn);
    if ([...history, ...current].some((row) => row.spend === null || row.spend < 0)) {
      report.excludedModels.push({ model, reason: "Missing spend or negative cost adjustments prevent this comparison." });
      continue;
    }
    const expectedOn = (date, metric) => {
      const weekday = new Date(date + "T00:00:00Z").getUTCDay();
      const values = baselineDates.filter((baseline) => new Date(baseline + "T00:00:00Z").getUTCDay() === weekday).map((baseline) => metricsOn(baseline)[metric]);
      return values.some((value) => value === null) ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
    };
    const actual = Object.fromEntries(METRICS.map((metric) => [metric, sumKnown(current.map((row) => row[metric]))]));
    const expected = Object.fromEntries(METRICS.map((metric) => [metric, sumKnown(analysisDates.map((date) => expectedOn(date, metric)))]));
    const costImpact = actual.spend - expected.spend;
    const percentageIncrease = expected.spend > 0 ? costImpact / expected.spend * 100 : null;
    const newUsage = expected.spend === 0 && actual.spend > 0;
    if (costImpact <= 0 || costImpact < impactThreshold || (!newUsage && percentageIncrease < increaseThreshold)) continue;
    report.findings.push({
      model,
      kind: newUsage ? "new_spend" : "spend_spike",
      actual,
      expected,
      costImpact,
      percentageIncrease,
      changes: Object.fromEntries(METRICS.map((metric) => [metric, change(expected[metric], actual[metric])])),
      daily: analysisDates.map((date) => ({ date, actualSpend: metricsOn(date).spend, expectedSpend: expectedOn(date, "spend") })),
    });
  }
  report.findings.sort((a, b) => b.costImpact - a.costImpact || a.model.localeCompare(b.model));
  return report;
}

/** Attribute a model spike only after the filtered daily key totals reconcile. */
export function buildLiteLlmAnomalyContributors({ response, globalResponse, finding, range, keys }) {
  const unavailable = (reason) => ({ status: "unavailable", reason, model: finding.model, range, contributors: [] });
  if (!Array.isArray(response?.results) || response.metadata?.has_more || Number(response.metadata?.total_pages) > 1) return unavailable("Incomplete model-filtered activity. No user or key attribution was inferred.");
  const globalDates = new Map(globalResponse.results.map((day) => [day.date ?? day.start_date ?? day.day, day]));
  const filteredDates = new Map();
  for (const day of response.results) {
    const date = day.date ?? day.start_date ?? day.day;
    if (typeof date !== "string" || date < range.baselineStartDate || date > range.endDate || filteredDates.has(date)) return unavailable("Unexpected or duplicate model activity dates.");
    filteredDates.set(date, day);
  }
  const sameSpend = (a, b) => Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.000001);
  const byKey = new Map();
  for (const date of datesBetween(range.baselineStartDate, range.endDate)) {
    const globalDay = globalDates.get(date);
    if (!globalDay) return unavailable("The source comparison is missing a date. Refresh analysis before attributing spend.");
    const globalModel = (globalDay.breakdown?.models ?? globalDay.models)?.[finding.model];
    const modelSpend = globalModel ? readMetrics(globalModel.metrics ?? globalModel).spend : 0;
    const filteredDay = filteredDates.get(date);
    // Omitted filtered dates are zero only when the complete gateway comparison
    // independently establishes zero traffic for this model on that date.
    if (!filteredDay) {
      if (modelSpend !== 0) return unavailable("Model-filtered activity is missing a nonzero source date.");
      continue;
    }
    const total = readMetrics(filteredDay.metrics ?? filteredDay).spend;
    if (total === null || total < 0 || modelSpend === null || !sameSpend(total, modelSpend)) return unavailable("Model-filtered spend differs from the anomaly snapshot. Refresh analysis; no attribution was inferred.");
    const breakdown = filteredDay.breakdown?.api_keys ?? filteredDay.api_keys;
    if ((!breakdown || typeof breakdown !== "object" || Array.isArray(breakdown)) && total !== 0) return unavailable("Key breakdown is missing for this model. Gateway-wide key totals cannot identify the source of a model spike.");
    let sum = 0;
    for (const [id, value] of Object.entries(breakdown ?? {})) {
      const amount = readMetrics(value?.metrics ?? value).spend;
      if (amount === null || amount < 0) return unavailable("Missing key spend or negative adjustments prevent attribution.");
      sum += amount;
      if (!byKey.has(id)) byKey.set(id, new Map());
      byKey.get(id).set(date, amount);
    }
    if (!sameSpend(sum, total)) return unavailable("Key spend does not reconcile with this model's daily spend. No attribution was inferred.");
  }
  const catalog = new Map();
  for (const key of keys) {
    catalog.set(key.upstreamKey, key.public);
    catalog.set(createHash("sha256").update(key.upstreamKey).digest("hex"), key.public);
  }
  const baselineDates = datesBetween(range.baselineStartDate, range.baselineEndDate);
  const analysisDates = datesBetween(range.startDate, range.endDate);
  const rows = [...byKey].map(([id, activity]) => {
    const actualSpend = analysisDates.reduce((sum, date) => sum + (activity.get(date) ?? 0), 0);
    const expectedSpend = analysisDates.reduce((sum, date) => {
      const weekday = new Date(date + "T00:00:00Z").getUTCDay();
      return sum + baselineDates.filter((baseline) => new Date(baseline + "T00:00:00Z").getUTCDay() === weekday).reduce((total, baseline) => total + (activity.get(baseline) ?? 0), 0) / 4;
    }, 0);
    const key = catalog.get(id);
    return { keyId: key?.id ?? "vk_" + createHash("sha256").update(id).digest("hex").slice(0, 16), keyLabel: key?.label.slice(0, 200) ?? "Unrecognized key", owner: key?.owner.slice(0, 200) ?? "Unknown owner", selectable: Boolean(key), actualSpend, expectedSpend, costImpact: actualSpend - expectedSpend };
  });
  const actualSpend = rows.reduce((sum, row) => sum + row.actualSpend, 0);
  const expectedSpend = rows.reduce((sum, row) => sum + row.expectedSpend, 0);
  if (!sameSpend(actualSpend, finding.actual.spend) || !sameSpend(expectedSpend, finding.expected.spend)) return unavailable("Key totals differ from the model comparison. Refresh analysis before attributing spend.");
  const positive = rows.filter((row) => row.costImpact > 0.000000001).sort((a, b) => b.costImpact - a.costImpact || a.keyId.localeCompare(b.keyId));
  const addedSpend = positive.reduce((sum, row) => sum + row.costImpact, 0);
  const offsetSpend = rows.reduce((sum, row) => sum + Math.min(0, row.costImpact), 0);
  const unknownKeys = rows.filter((row) => !row.selectable && (row.actualSpend || row.expectedSpend)).length;
  return {
    status: "ready", model: finding.model, range, actualSpend, expectedSpend, addedSpend, offsetSpend,
    increasingKeys: positive.length, unknownKeys,
    contributors: positive.slice(0, 10).map((row) => ({ ...row, addedSpendSharePercent: addedSpend > 0 ? row.costImpact / addedSpend * 100 : 0 })),
    otherAddedSpend: positive.slice(10).reduce((sum, row) => sum + row.costImpact, 0),
    methodology: "Model-filtered daily key spend, reconciled against the model anomaly snapshot. Expected spend uses each key's preceding four-week weekday means. Shares use all positive key increases; decreases offset those increases. Ownership identifies a credential owner, not necessarily the person or workload using it.",
  };
}

function readMetrics(value) {
  const inputTokens = optionalCount(value?.prompt_tokens, value?.total_prompt_tokens);
  const outputTokens = optionalCount(value?.completion_tokens, value?.total_completion_tokens);
  return {
    spend: optionalNumber(value?.spend, value?.total_spend, value?.cost),
    inputTokens,
    outputTokens,
    totalTokens: optionalCount(value?.total_tokens, value?.tokens) ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null),
    requests: optionalCount(value?.api_requests, value?.requests, value?.request_count, value?.successful_requests),
    cacheReadTokens: optionalCount(value?.cache_read_input_tokens, value?.total_cache_read_input_tokens),
    cacheWriteTokens: optionalCount(value?.cache_creation_input_tokens, value?.total_cache_creation_input_tokens),
  };
}

function optionalNumber(...values) {
  const value = values.find((entry) => entry !== null && entry !== undefined && entry !== "");
  return value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
}

function optionalCount(...values) {
  const value = optionalNumber(...values);
  return value !== null && value >= 0 ? value : null;
}

function sumKnown(values) {
  return values.some((value) => value === null) ? null : values.reduce((sum, value) => sum + value, 0);
}

function change(expected, actual) {
  if (expected === null || actual === null) return { difference: null, percent: null };
  const difference = actual - expected;
  return { difference, percent: expected > 0 ? difference / expected * 100 : null };
}

function threshold(value, fallback, max) {
  if (value === null || value === undefined || value === "") return fallback;
  return Number.isFinite(Number(value)) ? Math.min(max, Math.max(0, Number(value))) : fallback;
}

function dateString(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function datesBetween(startDate, endDate) {
  const dates = [];
  for (let time = Date.parse(startDate + "T00:00:00Z"); time <= Date.parse(endDate + "T00:00:00Z"); time += DAY_MS) dates.push(dateString(time));
  return dates;
}
