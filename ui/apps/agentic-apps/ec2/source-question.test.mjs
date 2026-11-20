import assert from "node:assert/strict";
import test from "node:test";
import { buildInfrastructureSourceQuestion } from "./source-question.mjs";

const instance = { instanceId: "i-0123456789abcdef0", name: "example-worker", profile: "primary", accountId: "123456789012", region: "us-east-1", secretAccessKey: "must-not-appear" };

test("source question includes selected identity and missing-source uncertainty without secrets", () => {
  const question = buildInfrastructureSourceQuestion(instance, { status: "unknown", reason: "No repository tag was reported." });
  for (const value of [instance.instanceId, instance.name, instance.profile, instance.region, "No repository tag", "do not modify"]) assert.ok(question.includes(value));
  assert.ok(!question.includes(instance.secretAccessKey));
});

test("source question includes tag evidence as bounded data and serializes for the browser", () => {
  const build = (0, eval)("(" + buildInfrastructureSourceQuestion.toString() + ")");
  const question = build({ ...instance, name: "example\nworker" }, { status: "tag-provided", repositoryUrl: "https://git.example.com/example/infra", path: "accounts/primary/main.tf", ref: "main", workspace: "primary", address: "aws_instance.worker" });
  for (const value of ["example worker", "accounts/primary/main.tf", "aws_instance.worker", "Verify any tag-provided association"]) assert.ok(question.includes(value));
  assert.ok(build({ ...instance, name: "x".repeat(100000) }, {}).length < 12000);
});
