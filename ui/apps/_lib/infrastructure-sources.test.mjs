import assert from "node:assert/strict";
import test from "node:test";
import { infrastructureSourceConfiguration, correlateInfrastructureSource, renderInfrastructureSource } from "./infrastructure-sources.mjs";
import { createInfrastructureSourceCache } from "./infrastructure-source-cache.mjs";

const config = infrastructureSourceConfiguration({ repositories: [{ id: "example-infra", url: "https://github.com/example/infrastructure", ref: "main" }] });
const tags = (values) => Object.entries(values).map(([key, value]) => ({ key, value }));
const resource = (values) => ({ tags: tags(values), retrievedAt: "2026-10-26T00:00:00Z" });

test("repository allowlist resolves exact tags, optional path/ref/workspace, and visible evidence", () => {
  const match = correlateInfrastructureSource(resource({ Repository: "example/infrastructure", TerraformPath: "environments/dev/main.tf", GitRef: "release/v1", TerraformWorkspace: "dev", TerraformResource: "module.worker.aws_instance.main", Owner: "example-team" }), config);
  assert.equal(match.status, "tag-provided");
  assert.equal(match.sourceUrl, "https://github.com/example/infrastructure/blob/release%2Fv1/environments/dev/main.tf");
  assert.equal(match.workspace, "dev"); assert.equal(match.owner, "example-team");
  assert.equal(match.evidence.length, 6); assert.equal(match.observedAt, "2026-10-26T00:00:00Z");
  assert.match(match.reason, /not been verified/);
  assert.equal(correlateInfrastructureSource(resource({ Repository: "https://github.com/example/infrastructure.git" }), config).status, "tag-provided");
});

test("untrusted, ambiguous, or traversing tag values cannot generate source links", () => {
  for (const fields of [
    { Repository: "https://untrusted.example/infrastructure" },
    { Repository: "javascript:alert(1)" },
    { Repository: "example-infra", GitRepository: "other" },
    ...["../secret", "https://other.example/file.tf", "/root/main.tf", "%2e%2e/main.tf", "a\\b.tf", "a/./b.tf", "a//b.tf"].map((TerraformPath) => ({ Repository: "example-infra", TerraformPath })),
    { Repository: "example-infra", GitRef: "main?token=example" },
    { Repository: "example-infra", Owner: "first", ResourceOwner: "second" },
  ]) { const result = correlateInfrastructureSource(resource(fields), config); assert.equal(result.status, "unknown"); assert.equal(result.sourceUrl, undefined); }
  assert.match(correlateInfrastructureSource(resource({ ManagedBy: "terraform" }), config).reason, /does not prove/);
  assert.equal(correlateInfrastructureSource(resource({ Repository: "example-infra" }), infrastructureSourceConfiguration()).status, "unknown");
});

test("configuration supports custom tag names and rejects unsafe repositories and refs", () => {
  const custom = infrastructureSourceConfiguration({ repositories: config.repositories, tagKeys: { repository: ["source_repo"] } });
  assert.equal(correlateInfrastructureSource(resource({ source_repo: "example-infra" }), custom).status, "tag-provided");
  for (const url of ["http://github.com/example/repo", "https://user:secret@github.com/example/repo", "https://github.com/example/repo?token=example", "https://github.com/example/repo/extra"]) assert.throws(() => infrastructureSourceConfiguration({ repositories: [{ id: "example", url }] }));
  assert.throws(() => infrastructureSourceConfiguration({ repositories: [...config.repositories, ...config.repositories] }));
  assert.throws(() => infrastructureSourceConfiguration({ repositories: [{ ...config.repositories[0], ref: "../main" }] }));
});

test("source cards escape external evidence and refuse non-HTTPS URLs", () => {
  const match = correlateInfrastructureSource(resource({ Repository: "example-infra", Owner: '<img src=x onerror="example">' }), config);
  const html = renderInfrastructureSource(match);
  assert.match(html, /Tag-provided association/); assert.match(html, /rel="noopener noreferrer"/);
  assert.ok(!html.includes('<img')); assert.match(html, /&lt;img/);
  assert.ok(!renderInfrastructureSource({ ...match, sourceUrl: "javascript:alert(1)" }).includes("href="));
});

test("source index paginates locally, coalesces concurrent readers, and preserves bounded stale coverage", async () => {
  let time = Date.parse("2026-10-26T00:00:00Z"), calls = 0, fail = false;
  const scopes = [{ profile: "primary", accountId: "111111111111", region: "us-east-1" }];
  const cache = createInfrastructureSourceCache({ scopes, enabled: true, ttlMs: 60000, now: () => time, loadScope: async () => {
    calls++; await new Promise((resolve) => setImmediate(resolve)); if (fail) throw Object.assign(new Error(), { name: "AccessDeniedException" });
    return { pages: 2, resources: Array.from({ length: 25 }, (_, i) => ({ name: "example-" + i, arn: "arn:aws:ec2:us-east-1:111111111111:instance/i-" + i, accountId: "111111111111", costServices: ["Compute"], source: { status: "unknown" } })) };
  } });
  const [a, b] = await Promise.all([cache.view(), cache.view()]); assert.equal(calls, 1); assert.equal(a.status, "ready"); assert.equal(b.total, 25); assert.equal(a.resources.length, 20);
  assert.equal((await cache.view({ page: 2, service: "Compute" })).resources.length, 5); assert.equal(calls, 1);
  assert.equal((await cache.view({ search: "example-24" })).total, 1);
  fail = true; time += 60001;
  const warm = await cache.view(); assert.equal(warm.total, 25); assert.equal(warm.coverage[0].status, "stale");
  await cache.refresh(); const stale = await cache.view(); assert.equal(stale.status, "partial"); assert.equal(stale.coverage[0].error, "AccessDeniedException");
  const failedCalls = calls; await cache.view(); assert.equal(calls, failedCalls);
  time += 180000; const expired = await cache.view(); assert.equal(expired.total, 0); assert.equal(expired.status, "unavailable");
});

test("disabled discovery does not call AWS; oversized results never enter the index", async () => {
  let calls = 0; const loadScope = async () => { calls++; return { pages: 1, resources: [{ text: "x".repeat(2000) }] }; };
  const scopes = [{ profile: "primary", region: "us-east-1" }];
  const disabled = createInfrastructureSourceCache({ scopes, enabled: false, loadScope });
  assert.equal((await disabled.view()).status, "disabled"); await disabled.refresh(); assert.equal(calls, 0);
  const bounded = createInfrastructureSourceCache({ scopes, enabled: true, maxBytes: 1024, loadScope });
  const result = await bounded.view(); assert.equal(result.bytes, 0); assert.equal(result.status, "unavailable");
});
