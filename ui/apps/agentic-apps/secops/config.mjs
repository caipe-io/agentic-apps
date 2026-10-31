import { parseAwsAccountList } from "../../_lib/aws-account-config.mjs";

export function secopsConfiguration(env = process.env) {
  const accounts = parseAwsAccountList(env.SECOPS_AWS_ACCOUNT_LIST || "");
  if (accounts.length > 64 || accounts.some((a) => !/^\d{12}$/.test(a.accountId)) || new Set(accounts.map((a) => a.accountId)).size !== accounts.length) throw new Error("Configure unique twelve-digit SecOps account IDs.");
  const regions = [...new Set(String(env.SECOPS_AWS_REGIONS || "").split(",").map((s) => s.trim()).filter(Boolean))];
  if (regions.length > 32 || regions.some((r) => !/^[a-z]{2}(?:-[a-z0-9]+){1,3}-\d$/.test(r))) throw new Error("Invalid configured AWS region.");
  const repos = [...new Set(String(env.SECOPS_GITHUB_REPOS || "").split(",").map((s) => s.trim()).filter(Boolean))];
  if (repos.length > 100 || repos.some((r) => (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(r) || [".", ".."].includes(r.split("/")[1])))) throw new Error("Configure valid owner/repository names.");
  const crossAccountRoleName = env.SECOPS_CROSS_ACCOUNT_ROLE_NAME || "read-only";
  const partition = env.SECOPS_AWS_PARTITION || "aws";
  if (!/^[A-Za-z0-9+=,.@_/-]{1,128}$/.test(crossAccountRoleName) || !["aws", "aws-us-gov", "aws-cn"].includes(partition)) throw new Error("Invalid AWS role configuration.");
  return { accounts, regions, repos, crossAccountRoleName, partition, awsAgentId: env.SECOPS_AWS_AGENT_ID || "", githubAgentId: env.SECOPS_GITHUB_AGENT_ID || "", assistantId: env.SECOPS_AGENT_ID || "agent-secops" };
}
