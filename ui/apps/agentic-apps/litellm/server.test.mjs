import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import vm from "node:vm";

import { renderLiteLlmDashboard } from "./dashboard.mjs";

test("dashboard scripts compile with hostile configuration safely serialized", () => {
  const html = renderLiteLlmDashboard({ compact: true, basePath: "/apps/example", appPath: "/apps/example", agentId: '</script><script>throw new Error("injection")</script>' });
  // Collect generated inline scripts for syntax checks; this does not sanitize HTML.
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\b[^>]*>/gi)];
  assert.equal(scripts.length, 2);
  for (const [, source] of scripts) new vm.Script(source);
  assert.match(html, /Search users or keys/);
  assert.match(html, /Most-used models/);
});

test("runtime serves searchable pages, refreshes spend, and loads usage for a key beyond upstream page one", async (t) => {
  const requests = [];
  let spend = 500;
  const upstream = createServer((req, res) => {
    const url = new URL(req.url, "http://example.test");
    requests.push(url);
    res.setHeader("content-type", "application/json");
    if (url.pathname === "/key/list") {
      assert.equal(url.searchParams.get("size"), "100");
      assert.equal(req.headers.authorization, "Bearer test-only-token");
      const firstPage = Array.from({ length: 100 }, (_, i) => ({ token: `upstream-private-${i}`, key_alias: `test-user-${i}`, user_id: `test-user-${i}@example.com`, spend: i }));
      res.end(JSON.stringify({ keys: url.searchParams.get("page") === "1" ? firstPage : [{ token: "upstream-private-secondary", key_alias: "secondary-user", user_id: "secondary-user@example.com", spend, max_budget: 1000 }], total_count: 101, total_pages: 2 }));
    } else if (url.pathname === "/model/info") {
      res.end(JSON.stringify({ data: [{ model_name: "model-example", model_info: { mode: "chat", input_cost_per_token: .000002, output_cost_per_token: .000008 }, litellm_params: { api_key: "private-provider-token" } }] }));
    } else if (url.pathname === "/key/info") {
      assert.equal(url.searchParams.get("key"), createHash("sha256").update("upstream-private-secondary").digest("hex"));
      res.end(JSON.stringify({ key: url.searchParams.get("key"), info: { models: ["model-example"], blocked: false, rpm_limit: 100, tpm_limit: 10000 } }));
    } else if (url.pathname === "/user/daily/activity/aggregated") {
      assert.equal(url.searchParams.get("api_key"), "upstream-private-secondary");
      res.end(JSON.stringify({ results: [{ date: url.searchParams.get("start_date"), metrics: { spend: 10, total_tokens: 100, requests: 2 }, breakdown: { models: { "model-example": { metrics: { spend: 10, total_tokens: 100, requests: 2 } } } } }] }));
    } else { res.statusCode = 404; res.end("{}"); }
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const child = spawn(process.execPath, ["ui/apps/agentic-apps/litellm/server.mjs"], {
    env: { ...process.env, NODE_ENV: "test", AGENTIC_APP_LITELLM_JWT_DISABLED: "true", LITELLM_APP_PORT: "0", LITELLM_API_URL: `http://127.0.0.1:${upstream.address().port}`, LITELLM_API_KEY: "test-only-token" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => { child.kill("SIGTERM"); upstream.closeAllConnections(); await new Promise((resolve) => upstream.close(resolve)); });
  // Discover the ephemeral app port from the readiness response socket binding.
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Runtime startup timed out: " + output)), 5000);
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error("Runtime exited: " + code + " " + output)); });
    child.stdout.on("data", () => {
      const match = output.match(/listening on http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const response = await fetch(base + "/api/virtual-keys");
  assert.equal(response.status, 200);
  const catalog = await response.json();
  assert.equal(catalog.keys.length, 10);
  assert.equal(catalog.keys[0].label, "secondary-user");
  assert.equal(catalog.pagination.totalCount, 101);
  assert.equal(JSON.stringify(catalog).includes("upstream-private"), false);
  assert.deepEqual(requests.map((url) => url.searchParams.get("page")), ["1", "2"]);
  const filtered = await (await fetch(base + "/api/virtual-keys?search=SECONDARY-USER%40example.com&page=100")).json();
  assert.equal(filtered.keys.length, 1);
  assert.equal(filtered.pagination.page, 1);
  const page = await (await fetch(base + "/api/virtual-keys?page=11")).json();
  assert.equal(page.keys.length, 1);
  assert.equal(page.pagination.totalPages, 11);
  const usage = await (await fetch(base + "/api/usage?key=" + catalog.keys[0].id + "&period=month")).json();
  assert.equal(usage.data.totals.spend, 10);
  assert.equal(usage.data.models[0].name, "model-example");
  assert.equal(JSON.stringify(usage).includes("upstream-private"), false);
  assert.equal(requests.filter((url) => url.pathname === "/key/list").length, 2);
  const models = await (await fetch(base + "/api/models?key=" + catalog.keys[0].id)).json();
  assert.equal(models.success, true);
  assert.equal(models.data.models[0].inputCostPerMillion, 2);
  assert.equal(models.data.models[0].keyProvisioning, "Listed on key");
  assert.equal(models.data.provisioning.rpmLimit, 100);
  assert.equal(JSON.stringify(models).includes("private"), false);
  assert.equal((await fetch(base + "/api/models?key=missing")).status, 404);
  const unselected = await (await fetch(base + "/api/models")).json();
  assert.equal(unselected.data.models[0].inputCostPerMillion, 2);
  assert.equal(unselected.data.provisioning.status, "not-selected");
  spend = 700;
  const refreshed = await (await fetch(base + "/api/virtual-keys?refresh=true")).json();
  assert.equal(refreshed.keys[0].spend, 700);
  const missing = await fetch(base + "/api/usage?key=missing");
  assert.equal(missing.status, 404);
});
