import test from "node:test";
import assert from "node:assert/strict";
import { buildSecopsAwsSelection } from "./dashboard.mjs";

const configuration = { accounts: [{ profile: "production", accountId: "123456789012" }, { profile: "development", accountId: "234567890123" }], regions: ["us-east-2"] };
const selection = { configuration, profile: "production", region: "us-east-2" };
const scope = { profile: "production", accountId: "123456789012", region: "us-east-2" };

test("SecOps chat carries the selected configured account before an AWS review", () => {
  assert.deepEqual(buildSecopsAwsSelection(selection), { awsScope: scope, retrievedAt: null, networkCount: null, loadBalancerCount: null, iamUserCount: null, iamStatus: "not-loaded", iamReviewThresholdDays: 180 });
});

test("SecOps chat distinguishes complete IAM evidence from unavailable or stale evidence", () => {
  const snapshot = { scope, retrievedAt: "2026-10-31T12:00:00Z", users: { status: "ready", data: [{ name: "private-user" }] } };
  const loaded = buildSecopsAwsSelection({ ...selection, snapshot });
  assert.equal(loaded.iamUserCount, 1);
  assert.equal(loaded.iamStatus, "ready");
  assert.equal(loaded.retrievedAt, snapshot.retrievedAt);
  assert.doesNotMatch(JSON.stringify(loaded), /private-user/);
  const unavailable = buildSecopsAwsSelection({ ...selection, snapshot: { scope, users: { status: "unavailable", data: null } } });
  assert.equal(unavailable.iamUserCount, null);
  assert.equal(unavailable.iamStatus, "unavailable");
  for (const mismatch of [{ profile: "development" }, { accountId: "234567890123" }, { region: "us-west-2" }]) {
    const stale = buildSecopsAwsSelection({ ...selection, snapshot: { ...snapshot, scope: { ...scope, ...mismatch } } });
    assert.deepEqual(stale.awsScope, scope);
    assert.equal(stale.iamUserCount, null);
    assert.equal(stale.retrievedAt, null);
  }
});

test("SecOps chat excludes account and region selections outside deployment allowlists", () => {
  assert.equal(buildSecopsAwsSelection({ ...selection, profile: "unconfigured" }).awsScope, null);
  assert.equal(buildSecopsAwsSelection({ ...selection, region: "us-west-2" }).awsScope, null);
});
