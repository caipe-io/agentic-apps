import { EC2Client, DescribeInstancesCommand, DescribeSecurityGroupsCommand } from "@aws-sdk/client-ec2";
import { IAMClient, ListUsersCommand, ListAccessKeysCommand, GetAccessKeyLastUsedCommand } from "@aws-sdk/client-iam";
import { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand, DescribeTagsCommand } from "@aws-sdk/client-elastic-load-balancing-v2";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { fromNodeProviderChain, fromTemporaryCredentials, fromTokenFile } from "@aws-sdk/credential-providers";
import { createSecopsScopeCredentials } from "./credentials.mjs";
import { exposureSignals, iamUserRows } from "./findings.mjs";

async function collect(client, Command, field, { iam = false, elb = false, input = {} } = {}) {
  let token; const seen = new Set(); const rows = [];
  for (let page = 0; page < 200; page += 1) {
    const result = await client.send(new Command({ ...input, ...(token ? { [iam || elb ? "Marker" : "NextToken"]: token } : {}) }));
    if (!Array.isArray(result[field])) throw new Error("AWS returned an incomplete response.");
    rows.push(...result[field]);
    const next = iam ? (result.IsTruncated ? result.Marker : null) : elb ? result.NextMarker : result.NextToken;
    if (iam && result.IsTruncated && !next) throw new Error("AWS returned incomplete pagination.");
    if (!next) return rows;
    if (seen.has(next)) throw new Error("AWS returned a repeated pagination token.");
    seen.add(next); token = next;
  }
  throw new Error("AWS pagination limit reached; results are incomplete.");
}

function safeError(error) { return String(error?.name || "SourceUnavailable").slice(0, 120); }
async function result(fn) {
  try { return { status: "ready", data: await fn() }; }
  catch (error) { return { status: "unavailable", error: safeError(error), data: null }; }
}

export function createSecopsAwsService(configuration, { clientsForScope } = {}) {
  const credentials = clientsForScope ? null : createSecopsScopeCredentials(configuration, { fromNodeProviderChain, fromTemporaryCredentials, fromTokenFile });
  const pending = new Map();
  return async function scan(scope) {
    const account = configuration.accounts.find((entry) => entry.profile === scope.profile);
    if (!account || !configuration.regions.includes(scope.region)) throw new Error("Choose a configured account and region.");
    const key = account.accountId + ":" + scope.region;
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
    const options = clientsForScope ? null : { region: scope.region, credentials: credentials({ ...account, region: scope.region }), maxAttempts: 2 };
    const { ec2, iam, elb, sts } = clientsForScope ? clientsForScope({ ...account, region: scope.region }) : { ec2: new EC2Client(options), iam: new IAMClient(options), elb: new ElasticLoadBalancingV2Client(options), sts: new STSClient(options) };
    try {
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    if (identity.Account !== account.accountId) throw new Error("The AWS identity does not match the configured account.");
    const [network, loadBalancers, users] = await Promise.all([
      result(async () => {
        const [reservations, groups] = await Promise.all([collect(ec2, DescribeInstancesCommand, "Reservations"), collect(ec2, DescribeSecurityGroupsCommand, "SecurityGroups")]);
        if (reservations.some((reservation) => !Array.isArray(reservation.Instances))) throw new Error("Incomplete EC2 reservations.");
        return exposureSignals(reservations.flatMap((reservation) => reservation.Instances), groups);
      }),
      result(async () => {
        const lbs = (await collect(elb, DescribeLoadBalancersCommand, "LoadBalancers", { elb: true })).filter((lb) => lb.Scheme === "internet-facing");
        const rows = [];
        for (let i = 0; i < lbs.length; i += 20) {
          const chunk = lbs.slice(i, i + 20);
          const response = await elb.send(new DescribeTagsCommand({ ResourceArns: chunk.map((lb) => lb.LoadBalancerArn) }));
          const tagMap = new Map((response.TagDescriptions || []).map((entry) => [entry.ResourceArn, entry.Tags || []]));
          if (chunk.some((lb) => !tagMap.has(lb.LoadBalancerArn))) throw new Error("Load balancer tags are incomplete.");
          for (const lb of chunk) {
            const tags = tagMap.get(lb.LoadBalancerArn);
            const dev = tags.some((tag) => /^(environment|env|stage|name)$/i.test(tag.Key || "") && /(?:^|[^a-z0-9])(dev|development|test|staging|sandbox|nonprod)(?:$|[^a-z0-9])/i.test(tag.Value || ""));
            if (dev) rows.push({ name: lb.LoadBalancerName, arn: lb.LoadBalancerArn, type: lb.Type, scheme: lb.Scheme, state: lb.State?.Code || "unknown" });
          }
        }
        return rows;
      }),
      result(async () => {
        const list = await collect(iam, ListUsersCommand, "Users", { iam: true });
        const details = new Map(); let next = 0;
        const worker = async () => {
          while (next < list.length) {
            const user = list[next++];
            try {
              const metadata = await collect(iam, ListAccessKeysCommand, "AccessKeyMetadata", { iam: true, input: { UserName: user.UserName } });
              const keys = [];
              for (const key of metadata) {
                const used = await iam.send(new GetAccessKeyLastUsedCommand({ AccessKeyId: key.AccessKeyId }));
                keys.push({ createdAt: key.CreateDate, lastUsed: used.AccessKeyLastUsed?.LastUsedDate || null });
              }
              details.set(user.UserName, { complete: true, keys });
            } catch { details.set(user.UserName, { complete: false, keys: [] }); }
          }
        };
        await Promise.all(Array.from({ length: Math.min(5, list.length) }, worker));
        return iamUserRows(list, details);
      }),
    ]);
    return { source: "aws-sdk", scope: { profile: account.profile, accountId: account.accountId, region: scope.region }, retrievedAt: new Date().toISOString(), network, loadBalancers, users };
    } finally { for (const client of [ec2, iam, elb, sts]) client.destroy(); }
    })();
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  };
}
