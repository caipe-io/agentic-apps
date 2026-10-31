import test from "node:test";
import assert from "node:assert/strict";
import { createSecopsScopeCredentials } from "./credentials.mjs";

test("every SecOps account session is limited to the scanner's exact read calls", () => {
  const calls = [];
  const providers = { fromNodeProviderChain: () => ({}), fromTemporaryCredentials: (input) => { calls.push(input); return {}; } };
  const credentials = createSecopsScopeCredentials({ regions: ["us-east-2"], partition: "aws", crossAccountRoleName: "caipe-read-only" }, providers, { env: {} });
  for (const accountId of ["111111111111", "222222222222"]) credentials({ profile: "account", accountId });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    const policy = JSON.parse(call.params.Policy);
    assert.deepEqual(policy.Statement, [{ Effect: "Allow", Resource: "*", Action: ["sts:GetCallerIdentity", "ec2:DescribeInstances", "ec2:DescribeSecurityGroups", "elasticloadbalancing:DescribeLoadBalancers", "elasticloadbalancing:DescribeTags", "iam:ListUsers", "iam:ListAccessKeys", "iam:GetAccessKeyLastUsed"] }]);
    assert.equal(call.params.Tags, undefined);
  }
});
