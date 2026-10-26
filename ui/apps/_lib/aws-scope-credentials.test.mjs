import assert from "node:assert/strict";
import test from "node:test";
import { createAwsScopeCredentials } from "./aws-scope-credentials.mjs";

test("IRSA uses the paired projected token and assumes only a configured account role", () => {
  const calls = [], base = {};
  const providers = { fromTokenFile: (input) => { calls.push(input); return base; }, fromTemporaryCredentials: (input) => { calls.push(input); return {}; }, fromNodeProviderChain: () => { throw new Error("must not fall back"); } };
  const resolve = createAwsScopeCredentials({ partition: "aws", crossAccountRoleName: "example-read-only" }, providers, { region: "us-east-1", sessionName: "example-dashboard", env: { AWS_ROLE_ARN: "arn:aws:iam::111111111111:role/example-runtime", AWS_WEB_IDENTITY_TOKEN_FILE: "/var/run/example/token" } });
  const first = resolve({ profile: "primary", accountId: "222222222222" }); assert.equal(resolve({ profile: "alias", accountId: "222222222222" }), first);
  assert.equal(calls.length, 2); assert.equal(calls[1].masterCredentials, base); assert.equal(calls[1].params.RoleArn, "arn:aws:iam::222222222222:role/example-read-only");
});

test("partial IRSA configuration fails without trying another credential source", () => {
  assert.throws(() => createAwsScopeCredentials({}, {}, { sessionName: "example", region: "us-east-1", env: { AWS_ROLE_ARN: "example-role" } }), /both/);
});
