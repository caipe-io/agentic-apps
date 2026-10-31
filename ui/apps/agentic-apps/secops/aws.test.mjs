import test from "node:test";
import assert from "node:assert/strict";
import { createSecopsAwsService } from "./aws.mjs";
const config = { accounts: [{ profile: "primary", accountId: "123456789012" }], regions: ["us-east-1"], partition: "aws", crossAccountRoleName: "read-only" };
const makeClient = (fn) => ({ send: fn, destroy() {} });

test("follows AWS pagination and does not return access key IDs", async () => {
  const ec2 = makeClient(async (c) => { if (c.constructor.name === "DescribeInstancesCommand") return c.input.NextToken ? { Reservations: [] } : { Reservations: [], NextToken: "next" }; return { SecurityGroups: [] }; });
  const iam = makeClient(async (c) => {
    if (c.constructor.name === "ListUsersCommand") return c.input.Marker ? { Users: [{ UserName: "second", CreateDate: new Date("2025-01-01") }], IsTruncated: false } : { Users: [{ UserName: "first", CreateDate: new Date("2024-01-01") }], IsTruncated: true, Marker: "next" };
    if (c.constructor.name === "ListAccessKeysCommand") return { AccessKeyMetadata: c.input.UserName === "first" ? [{ AccessKeyId: "private-key-id", CreateDate: new Date("2024-01-01"), Status: "Inactive" }] : [], IsTruncated: false };
    if (c.constructor.name === "GetAccessKeyLastUsedCommand") return { AccessKeyLastUsed: { LastUsedDate: new Date("2024-02-01") } };
    throw new Error("unexpected command");
  });
  const elb = makeClient(async (c) => { assert.equal(c.constructor.name, "DescribeLoadBalancersCommand"); return c.input.Marker ? { LoadBalancers: [] } : { LoadBalancers: [], NextMarker: "next" }; });
  const sts = makeClient(async () => ({ Account: "123456789012" }));
  const scan = createSecopsAwsService(config, { clientsForScope: () => ({ ec2, iam, elb, sts }) });
  const data = await scan({ profile: "primary", region: "us-east-1" });
  assert.equal(data.users.data.length, 2); assert.equal(data.users.data[0].accessKeyOlder180Days, true); assert.equal(JSON.stringify(data).includes("private-key-id"), false);
  assert.equal(data.network.status, "ready"); assert.equal(data.loadBalancers.status, "ready");
});

test("identity mismatch and incomplete pagination cannot produce empty successful results", async () => {
  const ec2 = makeClient(async (c) => c.constructor.name === "DescribeInstancesCommand" ? { Reservations: [], NextToken: "repeated" } : { SecurityGroups: [] });
  const iam = makeClient(async () => ({ Users: [], IsTruncated: false }));
  const elb = makeClient(async () => ({ LoadBalancers: [] }));
  let account = "999999999999"; const sts = makeClient(async () => ({ Account: account }));
  const scan = createSecopsAwsService(config, { clientsForScope: () => ({ ec2, iam, elb, sts }) });
  await assert.rejects(() => scan({ profile: "primary", region: "us-east-1" }), /identity/);
  account = "123456789012";
  const data = await scan({ profile: "primary", region: "us-east-1" });
  assert.equal(data.network.status, "unavailable"); assert.equal(data.network.data, null);
});
