import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLiteLlmVirtualKeyListQuery,
  buildLiteLlmUsageDashboard,
  prepareLiteLlmVirtualKeys,
  loadLiteLlmVirtualKeys,
  selectLiteLlmVirtualKeys,
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
  assert.equal(report.trend.length, 7);
  assert.equal(report.trend[2].totalTokens, 0);
  assert.deepEqual(report.topModels.map((model) => model.name), ["model-b", "model-a"]);
  assert.equal(JSON.stringify(report).includes("hash-1"), false);
});

const makeKey = (index, extra = {}) => ({ token: `private-token-${index}`, key_alias: `test-user-${index}`, user_id: `owner-${index}@example.com`, spend: index, ...extra });

test("loads every upstream page before ranking, searching and paging keys", async () => {
  const calls = [];
  const keys = await loadLiteLlmVirtualKeys(async (page) => {
    calls.push(page);
    return { keys: page === 1 ? Array.from({ length: 100 }, (_, i) => makeKey(i)) : [makeKey(100, { key_alias: "secondary-user", spend: 500 })], current_page: page, total_pages: 2, total_count: 101 };
  });
  assert.deepEqual(calls, [1, 2]);
  assert.equal(keys.length, 101);
  const result = selectLiteLlmVirtualKeys(keys);
  assert.equal(result.keys[0].label, "secondary-user");
  assert.equal(result.pagination.totalCount, 101);
  assert.equal(result.pagination.totalPages, 11);
  assert.equal(result.maxSpend, 500);
  assert.equal(selectLiteLlmVirtualKeys(keys, { page: 11 }).keys.length, 1);
  for (const search of ["SECONDARY-USER", "secondary-user@example.com", "owner-100@example.com"]) {
    const filtered = selectLiteLlmVirtualKeys(keys, { search, page: 99 });
    assert.equal(filtered.keys[0].label, "secondary-user");
    assert.equal(filtered.pagination.page, 1);
    assert.equal(filtered.pagination.totalCount, 1);
  }
  assert.equal(JSON.stringify(result).includes("private-token"), false);
});

test("follows explicit page counts even when a page is shorter than the requested size", async () => {
  const calls = [];
  const keys = await loadLiteLlmVirtualKeys(async (page) => {
    calls.push(page);
    return { keys: [makeKey(page)], total_pages: 3, total_count: 3 };
  });
  assert.deepEqual(calls, [1, 2, 3]);
  assert.equal(keys.length, 3);
});

test("supports missing page metadata and overlapping pages without dropping later keys", async () => {
  const keys = await loadLiteLlmVirtualKeys(async (page) => ({ keys: page === 1 ? Array.from({ length: 100 }, (_, i) => makeKey(i)) : [makeKey(99), makeKey(100)], total_pages: null }));
  assert.equal(keys.length, 101);
  assert.equal(selectLiteLlmVirtualKeys(keys, { sort: "spend-asc" }).keys[0].spend, 0);
  const named = selectLiteLlmVirtualKeys(keys, { sort: "name", size: 100 });
  assert.equal(named.keys[0].label, "test-user-0");
});

test("fails instead of returning a successful partial catalog after upstream errors or stalled pagination", async () => {
  await assert.rejects(loadLiteLlmVirtualKeys(async (page) => {
    if (page === 2) throw new Error("upstream unavailable");
    return { keys: [makeKey(1)], total_pages: 2 };
  }), /upstream unavailable/);
  await assert.rejects(loadLiteLlmVirtualKeys(async () => ({ keys: [makeKey(1)], total_pages: 3 })), /did not advance/);
  await assert.rejects(loadLiteLlmVirtualKeys(async () => ({ keys: [makeKey(1)], total_pages: 2 })), /did not advance/);
  await assert.rejects(loadLiteLlmVirtualKeys(async () => ({ keys: [makeKey(1)], total_pages: 1, total_count: 2 })), /incomplete/);
  await assert.rejects(loadLiteLlmVirtualKeys(async () => ({ error: "unexpected response" })), /invalid virtual-key list/);
  await assert.rejects(loadLiteLlmVirtualKeys(async () => ({ keys: [{}] })), /invalid virtual-key record/);
});

test("empty searches and invalid pagination remain bounded and deterministic", () => {
  const keys = prepareLiteLlmVirtualKeys({ keys: [makeKey(1), makeKey(2)] });
  const empty = selectLiteLlmVirtualKeys(keys, { search: "missing-user" });
  assert.equal(empty.pagination.totalCount, 0);
  assert.equal(empty.pagination.totalPages, 1);
  assert.deepEqual(empty.keys, []);
  const bounded = selectLiteLlmVirtualKeys(keys, { size: 9999, page: "invalid", sort: "invalid" });
  assert.equal(bounded.pagination.size, 100);
  assert.equal(bounded.pagination.page, 1);
  assert.equal(bounded.keys[0].spend, 2);
});

test("keeps low-cost, heavily used models available for token and request rankings", () => {
  const models = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`model-${i}`, { metrics: { spend: 25 - i, total_tokens: i + 1, api_requests: i + 1 } }]));
  const report = buildLiteLlmUsageDashboard({
    key: prepareLiteLlmVirtualKeys({ keys: [makeKey(1)] })[0],
    range: resolveLiteLlmUsageRange("month", new Date("2026-09-02T00:00:00Z")),
    responses: [{ results: [{ date: "2026-09-02", metrics: { spend: 325, total_tokens: 325, api_requests: 325 }, breakdown: { models } }] }],
  });
  assert.equal(report.topModels.length, 20);
  assert.equal(report.models.length, 25);
  assert.equal(report.models.find((row) => row.name === "model-24").totalTokens, 25);
  assert.equal(report.models.find((row) => row.name === "model-24").requests, 25);
  assert.equal(report.trend[0].spend, 0);
});

test("distinguishes an unknown budget from an explicit zero allowance", () => {
  const keys = prepareLiteLlmVirtualKeys({ keys: [makeKey(1), makeKey(2, { max_budget: 0 }), makeKey(3, { max_budget: "invalid" })] });
  assert.equal(keys[0].public.maxBudget, null);
  assert.equal(keys[0].public.remainingBudget, null);
  assert.equal(keys[1].public.maxBudget, 0);
  assert.equal(keys[1].public.remainingBudget, 0);
  assert.equal(keys[1].public.budgetUtilizationPercent, null);
  assert.equal(keys[2].public.maxBudget, null);
});
