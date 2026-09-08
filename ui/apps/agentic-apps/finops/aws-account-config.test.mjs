import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAwsCostExplorerPrompt,
  parseAwsAccountList,
  resolveAwsProfile,
  selectDefaultAwsProfile,
} from "./aws-account-config.mjs";

test("parseAwsAccountList returns unique canonical profiles", () => {
  assert.deepEqual(parseAwsAccountList("primary:111111111111, secondary:222222222222,primary:333333333333"), [
    { profile: "primary", accountId: "111111111111" },
    { profile: "secondary", accountId: "222222222222" },
  ]);
});

test("selectDefaultAwsProfile only auto-selects an unambiguous account", () => {
  const accounts = parseAwsAccountList("primary:111111111111,secondary:222222222222");
  assert.equal(selectDefaultAwsProfile(accounts), "");
  assert.equal(selectDefaultAwsProfile(accounts, "secondary"), "secondary");
  assert.equal(selectDefaultAwsProfile(accounts.slice(0, 1)), "primary");
});

test("resolveAwsProfile requires and validates configured profiles", () => {
  const accounts = parseAwsAccountList("primary:111111111111,secondary:222222222222");
  assert.throws(() => resolveAwsProfile(accounts, ""), /Select an AWS account/);
  assert.throws(() => resolveAwsProfile(accounts, "missing"), /no longer available/);
  assert.equal(resolveAwsProfile(accounts, "primary"), "primary");
  assert.equal(resolveAwsProfile([], ""), "");
});

test("buildAwsCostExplorerPrompt includes the selected profile and exclusive end date", () => {
  const prompt = buildAwsCostExplorerPrompt({
    dashboardKind: "cost-overview",
    period: { label: "August 2026", start: "2026-08-01", end: "2026-08-31" },
    profile: "primary",
  });
  assert.match(prompt, /profile must be "primary"/);
  assert.match(prompt, /Start=2026-08-01,End=2026-09-01/);
  assert.doesNotMatch(prompt, /profile must be an empty string/);
});
