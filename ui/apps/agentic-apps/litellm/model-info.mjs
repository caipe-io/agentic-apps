import { createHash } from "node:crypto";

export function sanitizeLiteLlmModelInfo(payload, { maxModels = 100 } = {}) {
  const upstreamModels = Array.isArray(payload?.data) ? payload.data : [];
  const models = upstreamModels.slice(0, maxModels).map((entry) => {
    const modelInfo = isRecord(entry?.model_info) ? entry.model_info : {};
    const parameters = isRecord(entry?.litellm_params) ? entry.litellm_params : {};

    return compactObject({
      name: safeString(entry?.model_name),
      id: safeString(modelInfo.id),
      provider: safeString(modelInfo.litellm_provider ?? parameters.custom_llm_provider),
      upstreamModel: safeString(parameters.model),
      mode: safeString(modelInfo.mode),
      supportsFunctionCalling: safeBoolean(modelInfo.supports_function_calling),
      supportsVision: safeBoolean(modelInfo.supports_vision),
      inputCostPerMillion: perMillion(parameters.input_cost_per_token ?? modelInfo.input_cost_per_token),
      outputCostPerMillion: perMillion(parameters.output_cost_per_token ?? modelInfo.output_cost_per_token),
      maxInputTokens: safeNumber(modelInfo.max_input_tokens),
      maxOutputTokens: safeNumber(modelInfo.max_output_tokens),
      accessGroups: stringList(modelInfo.access_groups),
      pricingHasVariants: Object.keys({ ...parameters, ...modelInfo }).some((name) => name.includes("cost") && /above_|priority|flex|batch|image|second|audio|character|cache/.test(name)) || undefined,
    });
  });

  return {
    source: "litellm-model-info",
    totalModels: upstreamModels.length,
    returnedModels: models.length,
    truncated: upstreamModels.length > models.length,
    models,
  };
}

export function sanitizeKeyProvisioning(payload, { team, owner, warnings = [], now = new Date() } = {}) {
  const info = isRecord(payload?.info) ? payload.info : null;
  if (!info) return { status: "unknown", models: null, warnings: ["Key provisioning could not be loaded.", ...warnings] };
  const expiresAt = safeString(info.expires);
  const expired = expiresAt && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) <= now.getTime();
  return {
    status: info.blocked === true ? "blocked" : expired ? "expired" : ["active", "blocked", "expired", "revoked", "deleted"].includes(info.status) ? info.status : Array.isArray(info.models) ? "active" : "unknown",
    models: stringList(info.models) ?? null,
    teamId: safeString(info.team_id) ?? null,
    teamModels: stringList(team?.team_info?.models) ?? null,
    ownerModels: stringList(owner?.user_info?.models) ?? null,
    rpmLimit: safeNumber(info.rpm_limit) ?? null,
    tpmLimit: safeNumber(info.tpm_limit) ?? null,
    expiresAt: expiresAt ?? null,
    warnings,
  };
}

export function estimateModelRequestCost(model, inputTokens, outputTokens) {
  if (![inputTokens, outputTokens].every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000)) return null;
  if (model.mode && !["chat", "completion", "embedding"].includes(model.mode)) return null;
  if ((inputTokens > 0 && (!Number.isFinite(model.inputCostPerMillion) || model.inputCostPerMillion < 0)) || (outputTokens > 0 && (!Number.isFinite(model.outputCostPerMillion) || model.outputCostPerMillion < 0))) return null;
  const cost = (inputTokens > 0 ? inputTokens / 1_000_000 * model.inputCostPerMillion : 0) + (outputTokens > 0 ? outputTokens / 1_000_000 * model.outputCostPerMillion : 0);
  return Number.isFinite(cost) && cost >= 0 ? cost : null;
}

/** This describes declared key configuration, never an authorization decision. */
export function describeModelProvisioning(model, provisioning) {
  if (provisioning.status === "not-selected") return "Select a key";
  if (provisioning.status !== "active") return provisioning.status === "unknown" ? "Unknown" : `Key ${provisioning.status}`;
  const allowed = provisioning.models;
  if (!allowed) return "Unknown";
  if (!allowed.length || allowed.some((name) => ["*", "all-team-models", "all-proxy-models"].includes(name))) return "Inherited / verify policy";
  if (allowed.includes(model.name)) return "Listed on key";
  if (allowed.some((name) => model.accessGroups?.includes(name))) return "Model group listed";
  if (allowed.some((pattern) => pattern.includes("*") && matchesWildcard(model.name ?? "", pattern))) return "Key wildcard match";
  return "Not directly listed";
}

export async function loadLiteLlmModelCatalog(fetchJson, key = null) {
  const inventoryRequest = fetchJson("/model/info");
  const warnings = [];
  const lookup = key ? (/^[a-f0-9]{64}$/i.test(key.upstreamKey) ? key.upstreamKey.toLowerCase() : createHash("sha256").update(key.upstreamKey).digest("hex")) : null;
  // Key material remains server-side; hashes also keep raw tokens out of access logs.
  const infoRequest = key ? fetchJson("/key/info", { key: lookup }).catch(() => {
    warnings.push("Key provisioning lookup failed. Model access has not been determined.");
    return null;
  }) : Promise.resolve(null);
  const [rawInventory, keyInfo] = await Promise.all([inventoryRequest, infoRequest]);
  if (!Array.isArray(rawInventory?.data)) throw new Error("LiteLLM returned an invalid model inventory");
  let team, owner;
  if (typeof keyInfo?.info?.team_id === "string" && keyInfo.info.team_id) {
    try { team = await fetchJson("/team/info", { team_id: keyInfo.info.team_id }); }
    catch { warnings.push("Team model restrictions could not be loaded."); }
  } else if (typeof keyInfo?.info?.user_id === "string" && keyInfo.info.user_id) {
    try { owner = await fetchJson("/user/info", { user_id: keyInfo.info.user_id }); }
    catch { warnings.push("Owner model restrictions could not be loaded."); }
  }
  const provisioning = key ? sanitizeKeyProvisioning(keyInfo, { team, owner, warnings }) : { status: "not-selected", models: null, warnings: [] };
  const inventory = sanitizeLiteLlmModelInfo(rawInventory, { maxModels: Infinity });
  return {
    ...inventory,
    models: inventory.models.map((model) => ({ ...model, keyProvisioning: describeModelProvisioning(model, provisioning) })),
    virtualKey: key ? { id: key.public.id, label: key.public.label } : null,
    provisioning,
    updatedAt: new Date().toISOString(),
    priceCurrency: "USD",
    priceUnit: "1M tokens",
  };
}

function matchesWildcard(value, pattern) {
  let textIndex = 0, patternIndex = 0, star = -1, retryIndex = 0;
  while (textIndex < value.length) {
    if (pattern[patternIndex] === value[textIndex]) { textIndex += 1; patternIndex += 1; }
    else if (pattern[patternIndex] === "*") { star = patternIndex++; retryIndex = textIndex; }
    else if (star !== -1) { patternIndex = star + 1; textIndex = ++retryIndex; }
    else return false;
  }
  while (pattern[patternIndex] === "*") patternIndex += 1;
  return patternIndex === pattern.length;
}

function perMillion(value) {
  const rate = safeNumber(value);
  if (rate === undefined || !Number.isFinite(rate * 1_000_000)) return undefined;
  return rate * 1_000_000;
}

function safeNumber(value) {
  if (!(typeof value === "number" || (typeof value === "string" && value.trim()))) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function stringList(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? [...new Set(value.map((entry) => entry.trim()).filter(Boolean))] : undefined;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeBoolean(value) {
  return typeof value === "boolean" ? value : undefined;
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
