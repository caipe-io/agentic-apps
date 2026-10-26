import assert from "node:assert/strict";
import test from "node:test";
import { infrastructureSourceConfiguration } from "../../_lib/infrastructure-sources.mjs";
import { createFinopsInfrastructureSources, infrastructureResource } from "./sdk-infrastructure-sources.mjs";

const sources = infrastructureSourceConfiguration({ repositories: [{ id: "example-infra", url: "https://github.com/example/infrastructure" }] });
const scope = { profile: "primary", accountId: "111111111111", region: "us-east-1" };
const mapping = (id = "example") => ({ ResourceARN: "arn:aws:neptune-graph:us-east-1:111111111111:graph/" + id, Tags: [{ Key: "Repository", Value: "example-infra" }, { Key: "Name", Value: id }] });

test("resource identity is scoped and service association never allocates cost", () => {
  const row = infrastructureResource(mapping(), scope, sources, "2026-10-26T00:00:00Z");
  assert.equal(row.source.status, "tag-provided"); assert.deepEqual(row.costServices, ["Amazon Neptune"]); assert.equal(row.cost, undefined);
  assert.throws(() => infrastructureResource({ ...mapping(), ResourceARN: mapping().ResourceARN.replace("111111111111", "222222222222") }, scope, sources));
  assert.throws(() => infrastructureResource({ ...mapping(), ResourceARN: mapping().ResourceARN.replace("us-east-1", "us-east-2") }, scope, sources));
  const instance = infrastructureResource({ ...mapping(), ResourceARN: "arn:aws:ec2:us-east-1:111111111111:instance/i-0123456789abcdef0" }, scope, sources);
  assert.equal(instance.instanceHref, "/apps/ec2?profile=primary&region=us-east-1&tab=instances&instanceId=i-0123456789abcdef0");
  const unknown = infrastructureResource({ ResourceARN: "arn:aws:example:us-east-1:111111111111:example/resource", Tags: [] }, scope, sources);
  assert.deepEqual(unknown.costServices, []); assert.equal(unknown.source.status, "unknown");
});

test("discovery follows all AWS pages, verifies STS identity, and reuses filtered snapshots", async () => {
  let pages = 0, identities = 0;
  const configuration = { accounts: [scope], region: "us-east-1", cacheTtlMs: 28800000, crossAccountRoleName: "read-only", partition: "aws" };
  const service = createFinopsInfrastructureSources(configuration, sources, { env: { FINOPS_SOURCE_REGIONS: "us-east-1" }, clientsForScope: () => ({
    sts: { async send() { identities++; return { Account: scope.accountId }; } },
    tagging: { async send(command) { pages++; return { ResourceTagMappingList: [mapping(command.input.PaginationToken ? "second" : "first")], ...(command.input.PaginationToken ? {} : { PaginationToken: "next" }) }; } },
  }) });
  const first = await service.view(); assert.equal(first.total, 2); assert.equal(first.associated, 2); assert.equal(pages, 2); assert.equal(identities, 1);
  assert.equal((await service.view({ service: "Amazon Neptune", search: "second" })).total, 1); assert.equal(pages, 2);
  const denied = createFinopsInfrastructureSources(configuration, sources, { env: {}, clientsForScope: () => ({ sts: { async send() { return { Account: "222222222222" }; } }, tagging: { async send() { assert.fail("Wrong account must not be queried"); } } }) });
  assert.equal((await denied.view()).status, "unavailable");
});

test("repeated pagination cannot publish partial source associations", async () => {
  let page = 0;
  const service = createFinopsInfrastructureSources({ accounts: [scope], region: scope.region, cacheTtlMs: 28800000, crossAccountRoleName: "read-only", partition: "aws" }, sources, { env: {}, clientsForScope: () => ({ sts: { async send() { return { Account: scope.accountId }; } }, tagging: { async send() { return { ResourceTagMappingList: [mapping(String(++page))], PaginationToken: "repeated" }; } } }) });
  const result = await service.view(); assert.equal(result.total, 0); assert.equal(result.status, "unavailable"); assert.equal(page, 2);
});
