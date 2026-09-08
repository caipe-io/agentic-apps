import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLiteLlmVirtualKeyListQuery,
  buildLiteLlmUsageDashboard,
  prepareLiteLlmVirtualKeys,
  resolveLiteLlmUsageRange,
} from "./usage.mjs";

test("uses only supported bounded LiteLLM key-list parameters", () => {
  assert.deepEqual(buildLiteLlmVirtualKeyListQuery(), {
    page: 1,
    size: 100,
    return_full_object: true,
  });
  assert.deepEqual(buildLiteLlmVirtualKeyListQuery(2), {
    page: 2,
    size: 100,
    return_full_object: true,
  });
  assert.equal("sort_by" in buildLiteLlmVirtualKeyListQuery(), false);
  assert.equal("sort_order" in buildLiteLlmVirtualKeyListQuery(), false);
});

test("sanitizes virtual keys without exposing upstream key material", () => {
  const prepared = prepareLiteLlmVirtualKeys({
    keys: [{
      token: "sk-secret-key-material",
      key_alias: "platform-preview",
      user_id: "owner@example.com",
      max_budget: 100,
      spend: 42.5,
      budget_duration: "monthly",
    }],
  });

  assert.equal(prepared.length, 1);
  assert.equal(prepared[0].public.label, "platform-preview");
  assert.equal(prepared[0].public.owner, "owner@example.com");
  assert.equal(prepared[0].public.remainingBudget, 57.5);
  assert.equal(prepared[0].public.budgetUtilizationPercent, 42.5);
  assert.equal(JSON.stringify(prepared[0].public).includes("sk-secret"), false);
  assert.equal(prepared[0].upstreamKey, "sk-secret-key-material");
});

test("resolves current, month, and several-month reporting windows", () => {
  const now = new Date("2026-09-07T15:00:00Z");
  assert.deepEqual(resolveLiteLlmUsageRange("current", now), {
    period: "current",
    label: "Today",
    startDate: "2026-09-07",
    endDate: "2026-09-07",
    granularity: "day",
    segments: [{ startDate: "2026-09-07", endDate: "2026-09-07" }],
  });
  assert.equal(resolveLiteLlmUsageRange("month", now).startDate, "2026-09-01");
  const sixMonths = resolveLiteLlmUsageRange("6m", now);
  assert.equal(sixMonths.startDate, "2026-04-01");
  assert.equal(sixMonths.segments.length, 6);
  assert.equal(sixMonths.granularity, "month");
});

test("aggregates selected-key usage and trends across API responses", () => {
  const key = prepareLiteLlmVirtualKeys({
    keys: [{ token: "hash-1", key_alias: "preview", max_budget: 20, spend: 7 }],
  })[0];
  const range = resolveLiteLlmUsageRange("month", new Date("2026-09-07T15:00:00Z"));
  const report = buildLiteLlmUsageDashboard({
    key,
    range,
    responses: [{
      results: [
        {
          date: "2026-09-01",
          metrics: { spend: 1.5, total_tokens: 1000, prompt_tokens: 700, completion_tokens: 300, requests: 4 },
          breakdown: { models: { "model-a": { metrics: { spend: 1.5, total_tokens: 1000, requests: 4 } } } },
        },
        {
          date: "2026-09-02",
          metrics: { spend: 2.5, total_tokens: 2000, prompt_tokens: 1200, completion_tokens: 800, requests: 5 },
          breakdown: { models: { "model-b": { metrics: { spend: 2.5, total_tokens: 2000, requests: 5 } } } },
        },
      ],
    }],
  });

  assert.deepEqual(report.totals, {
    spend: 4,
    promptTokens: 1900,
    completionTokens: 1100,
    totalTokens: 3000,
    requests: 9,
  });
  assert.equal(report.trend.length, 2);
  assert.deepEqual(report.topModels.map((model) => model.name), ["model-b", "model-a"]);
  assert.equal(JSON.stringify(report).includes("hash-1"), false);
});
