import { createHash } from "node:crypto";

const PERIOD_MONTHS = Object.freeze({
  current: 0,
  month: 0,
  "3m": 2,
  "6m": 5,
  "12m": 11,
});

export function prepareLiteLlmVirtualKeys(payload) {
  const sourceKeys = Array.isArray(payload?.keys)
    ? payload.keys
    : Array.isArray(payload?.data)
      ? payload.data
      : [];

  return sourceKeys.flatMap((value) => {
    const key = typeof value === "string" ? { token: value } : value;
    if (!key || typeof key !== "object") return [];
    const upstreamKey = firstText(key.token, key.key_hash, key.key, key.key_name);
    if (!upstreamKey) return [];
    const id = `vk_${createHash("sha256").update(upstreamKey).digest("hex").slice(0, 16)}`;
    const label = firstText(key.key_alias, key.alias, key.key_name) || `Virtual key ${id.slice(-6)}`;
    const owner = firstText(
      key.user?.user_email,
      key.user?.user_id,
      key.user_id,
      key.created_by,
    );
    const maxBudget = number(firstValue(key.max_budget, key.budget?.max_budget, key.budget_limit));
    const spend = number(firstValue(key.spend, key.current_spend, key.budget?.spend));

    return [{
      upstreamKey,
      public: {
        id,
        label,
        owner: owner || "Unassigned",
        teamId: firstText(key.team_id, key.team?.team_id),
        maxBudget,
        spend,
        remainingBudget: maxBudget > 0 ? Math.max(0, maxBudget - spend) : null,
        budgetUtilizationPercent: maxBudget > 0 ? Math.min(999, spend / maxBudget * 100) : null,
        budgetDuration: firstText(key.budget_duration, key.budget?.duration),
        budgetResetAt: firstText(key.budget_reset_at, key.budget?.reset_at),
        expiresAt: firstText(key.expires, key.expires_at),
      },
    }];
  }).sort((left, right) => left.public.label.localeCompare(right.public.label));
}

export function resolveLiteLlmUsageRange(period, now = new Date()) {
  const normalizedPeriod = Object.hasOwn(PERIOD_MONTHS, period) ? period : "month";
  const end = utcDate(now);
  let start;
  let label;
  if (normalizedPeriod === "current") {
    start = new Date(end);
    label = "Today";
  } else if (normalizedPeriod === "month") {
    start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    label = "Current month";
  } else {
    start = new Date(Date.UTC(
      end.getUTCFullYear(),
      end.getUTCMonth() - PERIOD_MONTHS[normalizedPeriod],
      1,
    ));
    label = `Last ${normalizedPeriod.slice(0, -1)} months`;
  }

  return {
    period: normalizedPeriod,
    label,
    startDate: isoDate(start),
    endDate: isoDate(end),
    granularity: ["6m", "12m"].includes(normalizedPeriod) ? "month" : "day",
    segments: monthSegments(start, end),
  };
}

export function buildLiteLlmUsageDashboard({ key, range, responses }) {
  const totals = emptyMetrics();
  const models = new Map();
  const daily = new Map();
  const warnings = [];

  for (const response of responses) {
    const metadata = response?.metadata;
    if (metadata?.has_more) warnings.push("LiteLLM reported additional pages; this window may be partial.");
    for (const day of Array.isArray(response?.results) ? response.results : []) {
      if (!day || typeof day !== "object") continue;
      const date = firstText(day.date, day.start_date, day.day);
      const metrics = metricsFrom(day.metrics ?? day);
      addMetrics(totals, metrics);
      if (date) {
        const point = daily.get(date) ?? { date, ...emptyMetrics() };
        addMetrics(point, metrics);
        daily.set(date, point);
      }

      const breakdown = day.breakdown?.models ?? day.models;
      if (!breakdown || typeof breakdown !== "object") continue;
      for (const [name, value] of Object.entries(breakdown)) {
        const row = models.get(name) ?? { name, ...emptyMetrics() };
        addMetrics(row, metricsFrom(value?.metrics ?? value));
        models.set(name, row);
      }
    }
  }

  const trend = aggregateTrend([...daily.values()], range.granularity);
  const topModels = [...models.values()]
    .sort((left, right) => (right.spend - left.spend) || (right.totalTokens - left.totalTokens))
    .slice(0, 20);

  return {
    source: "/user/daily/activity/aggregated",
    generatedAt: new Date().toISOString(),
    range: {
      period: range.period,
      label: range.label,
      startDate: range.startDate,
      endDate: range.endDate,
      granularity: range.granularity,
    },
    virtualKey: key.public,
    totals,
    trend,
    topModels,
    warnings: [...new Set(warnings)],
  };
}

function aggregateTrend(points, granularity) {
  const buckets = new Map();
  for (const point of points) {
    const bucket = granularity === "month" ? String(point.date).slice(0, 7) : point.date;
    const target = buckets.get(bucket) ?? { date: bucket, ...emptyMetrics() };
    addMetrics(target, point);
    buckets.set(bucket, target);
  }
  return [...buckets.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function monthSegments(start, end) {
  const segments = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor <= end) {
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    segments.push({
      startDate: isoDate(cursor < start ? start : cursor),
      endDate: isoDate(monthEnd > end ? end : monthEnd),
    });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return segments;
}

function metricsFrom(value) {
  const promptTokens = number(firstValue(value?.prompt_tokens, value?.total_prompt_tokens));
  const completionTokens = number(firstValue(value?.completion_tokens, value?.total_completion_tokens));
  const totalTokens = number(firstValue(value?.total_tokens, value?.tokens)) || promptTokens + completionTokens;
  return {
    spend: number(firstValue(value?.spend, value?.total_spend, value?.cost)),
    promptTokens,
    completionTokens,
    totalTokens,
    requests: number(firstValue(
      value?.requests,
      value?.api_requests,
      value?.request_count,
      value?.successful_requests,
    )),
  };
}

function emptyMetrics() {
  return { spend: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0 };
}

function addMetrics(target, source) {
  for (const key of ["spend", "promptTokens", "completionTokens", "totalTokens", "requests"]) {
    target[key] += number(source?.[key]);
  }
}

function utcDate(value) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function isoDate(value) {
  return value.toISOString().slice(0, 10);
}

function firstText(...values) {
  const value = values.find((candidate) => typeof candidate === "string" && candidate.trim());
  return value?.trim() ?? "";
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
