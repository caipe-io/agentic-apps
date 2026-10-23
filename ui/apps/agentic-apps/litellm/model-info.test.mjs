import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { describeModelProvisioning, estimateModelRequestCost, loadLiteLlmModelCatalog, sanitizeKeyProvisioning, sanitizeLiteLlmModelInfo } from "./model-info.mjs";

const key = { upstreamKey: "sk-test-only-credential", public: { id: "vk_example", label: "test-user" } };
const inventory = { data: [{ model_name: "model-primary", litellm_params: { model: "provider/model-primary", api_key: "private-provider-secret", input_cost_per_token: 0.000002 }, model_info: { id: "deployment-primary", output_cost_per_token: 0.000008, mode: "chat", metadata: { secret: "private-metadata" } } }] };

test("model prices preserve configured zero rates, normalize per-million units, and strip secrets", () => {
  const result = sanitizeLiteLlmModelInfo({ data: [
    ...inventory.data,
    { model_name: "model-zero", litellm_params: { input_cost_per_token: 0 }, model_info: { input_cost_per_token: 1, output_cost_per_token: "0", access_groups: ["group-example"] } },
    { model_name: "model-unknown", model_info: { input_cost_per_token: -1, output_cost_per_token: Infinity } },
  ] });
  assert.equal(result.models[0].inputCostPerMillion, 2);
  assert.equal(result.models[0].outputCostPerMillion, 8);
  assert.equal(result.models[1].inputCostPerMillion, 0);
  assert.equal(result.models[1].outputCostPerMillion, 0);
  assert.equal(result.models[2].inputCostPerMillion, undefined);
  assert.equal(result.models[2].outputCostPerMillion, undefined);
  assert.equal(JSON.stringify(result).includes("private-"), false);
});

test("the dashboard catalog includes models beyond the bounded MCP inventory", () => {
  const payload = { data: Array.from({ length: 125 }, (_, i) => ({ model_name: `model-${i}` })) };
  assert.equal(sanitizeLiteLlmModelInfo(payload).returnedModels, 100);
  const all = sanitizeLiteLlmModelInfo(payload, { maxModels: Infinity });
  assert.equal(all.returnedModels, 125);
  assert.equal(all.truncated, false);
});

test("cost estimates combine input/output rates and never substitute a missing rate with free usage", () => {
  const model = { mode: "chat", inputCostPerMillion: 2, outputCostPerMillion: 8 };
  assert.ok(Math.abs(estimateModelRequestCost(model, 1000, 500) - .006) < 1e-12);
  assert.equal(estimateModelRequestCost({ inputCostPerMillion: 2 }, 1000, 0), .002);
  assert.equal(estimateModelRequestCost({ inputCostPerMillion: 2 }, 1000, 1000), null);
  assert.equal(estimateModelRequestCost({ inputCostPerMillion: 2, outputCostPerMillion: null }, 1000, 1000), null);
  assert.equal(estimateModelRequestCost({ inputCostPerMillion: -2, outputCostPerMillion: 8 }, 1000, 1000), null);
  assert.equal(estimateModelRequestCost({ inputCostPerMillion: 0, outputCostPerMillion: 0 }, 1000, 1000), 0);
  assert.equal(estimateModelRequestCost({ ...model, mode: "image_generation" }, 1000, 1000), null);
  for (const invalid of [-1, .5, Infinity, 1_000_000_001]) assert.equal(estimateModelRequestCost(model, invalid, 1000), null);
});

test("provisioning distinguishes explicit, inherited, unknown, blocked and expired states", () => {
  const active = sanitizeKeyProvisioning({ info: { models: ["model-primary", "model-other*", "group-example"] } });
  assert.equal(describeModelProvisioning({ name: "model-primary" }, active), "Listed on key");
  assert.equal(describeModelProvisioning({ name: "model-other-small" }, active), "Key wildcard match");
  assert.equal(describeModelProvisioning({ name: "model-grouped", accessGroups: ["group-example"] }, active), "Model group listed");
  assert.equal(describeModelProvisioning({ name: "model-missing" }, active), "Not directly listed");
  const literal = sanitizeKeyProvisioning({ info: { models: ["model.x*"] } });
  assert.equal(describeModelProvisioning({ name: "modelYx" }, literal), "Not directly listed");
  for (const models of [[], ["all-team-models"], ["all-proxy-models"], ["*"]]) {
    assert.equal(describeModelProvisioning({ name: "model-primary" }, sanitizeKeyProvisioning({ info: { models } })), "Inherited / verify policy");
  }
  assert.equal(describeModelProvisioning({ name: "model-primary" }, sanitizeKeyProvisioning(null)), "Unknown");
  assert.equal(describeModelProvisioning({ name: "model-primary" }, sanitizeKeyProvisioning({ info: {} })), "Unknown");
  assert.equal(describeModelProvisioning({ name: "model-primary" }, sanitizeKeyProvisioning({ info: { models: ["model-primary"], blocked: true } })), "Key blocked");
  assert.equal(sanitizeKeyProvisioning({ info: { models: [], expires: "2020-01-01T00:00:00Z" } }).status, "expired");
});

test("catalog fetches live provisioning using a hash and sanitizes key, owner, and model responses", async () => {
  const calls = [];
  const result = await loadLiteLlmModelCatalog(async (path, query) => {
    calls.push({ path, query });
    if (path === "/model/info") return inventory;
    if (path === "/key/info") return { key: query.key, info: { token: "private-key-token", models: ["model-primary"], user_id: "test-user@example.com", rpm_limit: 100, tpm_limit: 10000, metadata: { secret: "private-key-metadata" } } };
    if (path === "/user/info") return { user_info: { models: ["model-primary"], api_key: "private-owner-secret" }, keys: ["private-other-user-key"] };
    throw new Error("unexpected route");
  }, key);
  assert.equal(calls[1].query.key, createHash("sha256").update(key.upstreamKey).digest("hex"));
  assert.equal(result.provisioning.rpmLimit, 100);
  assert.equal(result.provisioning.tpmLimit, 10000);
  assert.deepEqual(result.provisioning.ownerModels, ["model-primary"]);
  assert.equal(result.models[0].keyProvisioning, "Listed on key");
  assert.equal(result.priceUnit, "1M tokens");
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("private-"), false);
  assert.equal(serialized.includes(key.upstreamKey), false);
  assert.equal(serialized.includes(calls[1].query.key), false);
});

test("team policy lookup failures are explicit and do not prevent price comparison", async () => {
  const result = await loadLiteLlmModelCatalog(async (path) => {
    if (path === "/model/info") return inventory;
    if (path === "/key/info") return { info: { models: ["all-team-models"], team_id: "team-example" } };
    throw new Error("permission denied");
  }, key);
  assert.equal(result.models[0].inputCostPerMillion, 2);
  assert.equal(result.models[0].keyProvisioning, "Inherited / verify policy");
  assert.equal(result.provisioning.teamModels, null);
  assert.match(result.provisioning.warnings[0], /Team model restrictions/);
});

test("key info failures remain unknown rather than granting every configured model", async () => {
  const result = await loadLiteLlmModelCatalog(async (path) => {
    if (path === "/model/info") return inventory;
    throw new Error("private upstream response must not reach browser");
  }, key);
  assert.equal(result.provisioning.status, "unknown");
  assert.equal(result.models[0].keyProvisioning, "Unknown");
  assert.equal(JSON.stringify(result).includes("private upstream"), false);
  await assert.rejects(loadLiteLlmModelCatalog(async (path) => path === "/model/info" ? {} : null, key), /invalid model inventory/);
});

test("model prices can be browsed without any selected key", async () => {
  const calls = [];
  const result = await loadLiteLlmModelCatalog(async (path) => { calls.push(path); return inventory; });
  assert.deepEqual(calls, ["/model/info"]);
  assert.equal(result.virtualKey, null);
  assert.equal(result.models[0].keyProvisioning, "Select a key");
  assert.equal(result.models[0].inputCostPerMillion, 2);
});
