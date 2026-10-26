import { ResourceGroupsTaggingAPIClient, GetResourcesCommand } from "@aws-sdk/client-resource-groups-tagging-api";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { fromNodeProviderChain, fromTemporaryCredentials, fromTokenFile } from "@aws-sdk/credential-providers";
import { createAwsScopeCredentials } from "../../_lib/aws-scope-credentials.mjs";
import { correlateInfrastructureSource } from "../../_lib/infrastructure-sources.mjs";
import { createInfrastructureSourceCache } from "../../_lib/infrastructure-source-cache.mjs";

export function infrastructureResource(row, scope, configuration, retrievedAt) {
  const match = /^arn:(aws(?:-us-gov|-cn)?):([a-z0-9-]+):([a-z0-9-]*):(\d{12})?:(.+)$/.exec(row.ResourceARN || "");
  if (!match || row.ResourceARN.length > 2048 || (match[4] && match[4] !== scope.accountId) || (match[3] && match[3] !== scope.region) || !Array.isArray(row.Tags) || row.Tags.length > 100 || row.Tags.some((tag) => typeof tag.Key !== "string" || tag.Key.length > 128 || typeof tag.Value !== "string" || tag.Value.length > 256)) throw new Error("Invalid resource identity or tags.");
  const tags = row.Tags.map((tag) => ({ key: tag.Key, value: tag.Value }));
  const service = match[2];
  const services = {
    ec2: [match[5].startsWith("instance/") ? "Amazon Elastic Compute Cloud - Compute" : "EC2 - Other"],
    s3: ["Amazon Simple Storage Service"], rds: ["Amazon Relational Database Service"],
    "neptune-graph": ["Amazon Neptune"], neptune: ["Amazon Neptune"],
    lambda: ["AWS Lambda"], eks: ["Amazon Elastic Container Service for Kubernetes"],
    ecs: ["Amazon Elastic Container Service"], dynamodb: ["Amazon DynamoDB"],
    elasticloadbalancing: ["Amazon Elastic Load Balancing"], logs: ["AmazonCloudWatch"],
    sagemaker: ["Amazon SageMaker"], es: ["Amazon OpenSearch Service"],
  };
  const instanceId = service === "ec2" && /^instance\/(i-[a-f0-9]{8}(?:[a-f0-9]{9})?)$/.exec(match[5])?.[1];
  const instanceHref = instanceId ? "/apps/ec2?" + new URLSearchParams({ profile: scope.profile, region: scope.region, tab: "instances", instanceId }) : null;
  return { instanceHref, arn: row.ResourceARN, name: tags.find((tag) => tag.key === "Name")?.value || match[5], accountId: scope.accountId, profile: scope.profile, region: match[3] || "global", awsService: service, costServices: services[service] || [], source: correlateInfrastructureSource({ tags, retrievedAt }, configuration) };
}

export function createFinopsInfrastructureSources(costConfiguration, sourceConfiguration, { env = process.env, clientsForScope, now = Date.now } = {}) {
  const regions = [...new Set((env.FINOPS_SOURCE_REGIONS || env.AWS_REGION || "us-east-1").split(",").map((region) => region.trim()))];
  if (!regions.length || regions.length > 8 || regions.some((region) => !/^[a-z]{2}(?:-[a-z0-9]+){1,3}-\d$/.test(region))) throw new Error("Configure one to eight valid infrastructure discovery regions.");
  const repositoryKeys = sourceConfiguration.tagKeys.repository;
  if (repositoryKeys.some((key) => !/^[\p{L}\p{Z}\p{N}_.:\/=+@-]+$/u.test(key))) throw new Error("Invalid AWS repository tag key.");
  const scopes = costConfiguration.accounts.flatMap((account) => regions.map((region) => ({ ...account, region })));
  if (scopes.length > 128) throw new Error("Too many infrastructure discovery scopes.");
  const credentials = createAwsScopeCredentials(costConfiguration, { fromNodeProviderChain, fromTemporaryCredentials, fromTokenFile }, { sessionName: "finops-source-discovery", region: costConfiguration.region });
  const clients = clientsForScope || ((scope) => {
    const options = { region: scope.region, credentials: credentials(scope), maxAttempts: 3 };
    return { sts: new STSClient(options), tagging: new ResourceGroupsTaggingAPIClient(options) };
  });
  return createInfrastructureSourceCache({ scopes, enabled: sourceConfiguration.enabled, ttlMs: costConfiguration.cacheTtlMs, now, loadScope: async (scope) => {
    const { sts, tagging } = clients(scope);
    try {
      const identity = await sts.send(new GetCallerIdentityCommand({}), { abortSignal: AbortSignal.timeout(30000) });
      if (!/^\d{12}$/.test(identity.Account) || (scope.accountId && scope.accountId !== identity.Account)) throw new Error("Infrastructure account identity mismatch.");
      const resources = new Map(), retrievedAt = new Date(now()).toISOString();
      let pages = 0;
      // Separate key-presence queries implement OR semantics; AWS combines keys with AND.
      for (const tagKey of repositoryKeys) {
        const seen = new Set(), tokens = new Set();
        let token;
        do {
          if (pages >= 500) throw new Error("Resource discovery exceeded its page bound.");
          const response = await tagging.send(new GetResourcesCommand({ ResourcesPerPage: 100, TagFilters: [{ Key: tagKey }], ...(token ? { PaginationToken: token } : {}) }), { abortSignal: AbortSignal.timeout(60000) });
          if (!Array.isArray(response.ResourceTagMappingList)) throw new Error("Resource discovery returned no coverage.");
          for (const row of response.ResourceTagMappingList) {
            const resource = infrastructureResource(row, { ...scope, accountId: identity.Account }, sourceConfiguration, retrievedAt);
            if (seen.has(resource.arn)) throw new Error("Resource discovery repeated an ARN within a tag query.");
            seen.add(resource.arn);
            // One resource can legitimately match more than one configured repository key.
            resources.set(resource.arn, resource);
          }
          pages += 1; token = response.PaginationToken;
          if (token && (typeof token !== "string" || token.length > 8192 || tokens.has(token))) throw new Error("Resource discovery repeated a pagination token.");
          if (token) tokens.add(token);
          if (resources.size > 50000) throw new Error("Resource discovery exceeded its snapshot bound.");
        } while (token);
      }
      return { resources: [...resources.values()], pages };
    } catch (error) {
      if (!clientsForScope) console.error("[finops] Infrastructure discovery failed", { profile: scope.profile, region: scope.region, error: error instanceof Error ? error.name : "UnknownError" });
      throw error;
    } finally { if (!clientsForScope) { sts.destroy(); tagging.destroy(); } }
  } });
}
