import { parseAwsAccountList } from "../../_lib/aws-account-config.mjs";

export function ec2Configuration(env = process.env) {
  const accounts = parseAwsAccountList(env.EC2_AWS_ACCOUNT_LIST ?? env.AWS_ACCOUNT_LIST);
  if (accounts.some((account) => account.accountId && !/^\d{12}$/.test(account.accountId))) throw new Error("AWS account IDs must contain 12 digits.");
  const regions = [...new Set(String(env.EC2_AWS_REGIONS || env.AWS_REGION || env.AWS_DEFAULT_REGION || "us-east-1").split(",").map((value) => value.trim()).filter((value) => /^[a-z]{2}(?:-[a-z0-9]+){1,3}-\d$/.test(value)))];
  if (!regions.length) throw new Error("Configure at least one valid AWS region.");
  const crossAccountRoleName = env.EC2_CROSS_ACCOUNT_ROLE_NAME || env.CROSS_ACCOUNT_ROLE_NAME || "read-only";
  if (!/^[A-Za-z0-9+=,.@_/-]{1,128}$/.test(crossAccountRoleName)) throw new Error("Invalid configured cross-account role name.");
  const partition = env.EC2_AWS_PARTITION || "aws";
  if (!["aws", "aws-us-gov", "aws-cn"].includes(partition)) throw new Error("Invalid AWS partition.");
  const cacheSeconds = Number(env.EC2_CACHE_TTL_SECONDS || 14400);
  if (!Number.isFinite(cacheSeconds) || cacheSeconds < 60 || cacheSeconds > 86400) throw new Error("EC2 cache lifetime must be between 60 seconds and one day.");
  return { accounts: accounts.length ? accounts : [{ profile: "", accountId: "", label: "Default AWS credentials" }], regions, agentId: env.EC2_AGENT_ID || "agent-ec2", crossAccountRoleName, partition, cacheTtlMs: cacheSeconds * 1000, cacheMaxBytes: 64 * 1024 * 1024 };
}

export function resolveEc2Scope(input, configuration) {
  const account = configuration.accounts.find((item) => item.profile === input?.profile);
  if (!account || !configuration.regions.includes(input?.region)) throw new Error("Choose a configured AWS account and region.");
  return { profile: account.profile, accountId: account.accountId || null, region: input.region };
}

/** Treat spaces, hyphens, underscores and case consistently across names, IDs and all tags. */
export function normalizeEc2Search(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** Browser-safe DTO boundary; AWS credentials and raw network metadata never belong here. */
export function validateEc2Response(value, { scope, cacheTtlMs = 14_400_000 }) {
  const object = (entry) => entry && typeof entry === "object" && !Array.isArray(entry);
  const text = (entry, max = 400) => typeof entry === "string" && entry.length <= max;
  const optionalText = (entry) => entry === null || text(entry);
  const number = (entry) => entry === null || (typeof entry === "number" && Number.isFinite(entry) && entry >= 0);
  if (!object(value) || value.source !== "aws-sdk" || !["ready", "partial"].includes(value.status) || value.profile !== scope.profile || value.region !== scope.region || !/^\d{12}$/.test(value.accountId) || (scope.accountId && value.accountId !== scope.accountId)) throw new Error("The AWS inventory identity does not match the requested scope.");
  const timestamp = Date.parse(value.retrievedAt);
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 300_000 || timestamp < Date.now() - cacheTtlMs - 300_000) throw new Error("The inventory snapshot has expired; refresh live data.");
  if (!Array.isArray(value.instances) || value.instances.length > 20_000 || !Array.isArray(value.warnings) || !value.warnings.every((warning) => text(warning, 2000))) throw new Error("Invalid inventory response.");
  if (!(value.nextToken === null || text(value.nextToken, 8192)) || value.complete !== !value.nextToken || !Number.isInteger(value.pages) || value.pages < 0 || value.pages > 200) throw new Error("Invalid inventory page coverage.");
  if (!Array.isArray(value.evidence) || value.evidence.length > 1000 || !value.evidence.every((entry) => object(entry) && ["sts", "ec2", "ssm", "pricing"].includes(entry.service) && text(entry.operation) && text(entry.region) && (entry.requestId === null || text(entry.requestId)))) throw new Error("Invalid AWS API evidence.");
  const ids = new Set();
  for (const row of value.instances) {
    if (!object(row) || !/^i-[a-f0-9]{8}(?:[a-f0-9]{9})?$/.test(row.instanceId) || ids.has(row.instanceId) || row.profile !== value.profile || row.region !== value.region || row.accountId !== value.accountId || !/^[a-z0-9-]+\.[a-z0-9]+$/.test(row.instanceType)) throw new Error("Invalid or duplicate EC2 instance.");
    ids.add(row.instanceId);
    if (!["pending", "running", "shutting-down", "terminated", "stopping", "stopped", "unknown"].includes(row.state) || ![row.name, row.platform, row.osVersion, row.architecture, row.cpuManufacturer, row.tenancy, row.lifecycle, row.launchTime].every(optionalText) || ![row.vcpu, row.memoryGiB].every(number) || ![true, false, null].includes(row.gpu)) throw new Error("Invalid EC2 attributes.");
    if (!Array.isArray(row.tags) || row.tags.length > 100 || row.tagCount !== row.tags.length || !row.tags.every((tag) => object(tag) && text(tag.key, 128) && text(tag.value, 256)) || new Set(row.tags.map((tag) => tag.key)).size !== row.tags.length) throw new Error("Invalid complete tag list.");
    if (row.launchTime !== null && !Number.isFinite(Date.parse(row.launchTime))) throw new Error("Invalid EC2 launch time.");
    if (row.pricing !== null) {
      const price = row.pricing;
      const os = ({ "Linux/UNIX": "Linux", Windows: "Windows" })[row.platform];
      if (!object(price) || typeof price.hourlyUsd !== "number" || !number(price.hourlyUsd) || !text(price.sku) || !price.sku || price.instanceType !== row.instanceType || price.region !== row.region || price.operatingSystem !== os || row.tenancy !== "default" || price.tenancy !== "Shared" || price.unit !== "Hrs") throw new Error("On-demand rate does not match the instance.");
    }
  }
  return value;
}
