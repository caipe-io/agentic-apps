#!/usr/bin/env node
import { createServer } from "node:http";
import { createRequiredAgenticAppJwtVerifier } from "../../_lib/jwt-verify.mjs";
import { authorizeAgenticAppRuntimeRequest } from "../../_lib/runtime-authorization.mjs";
import { resolveAgenticAppRuntimeBasePath } from "../../_lib/runtime-base-path.mjs";
import { secopsConfiguration } from "./config.mjs";
import { createSecopsAwsService } from "./aws.mjs";
import { createGithubScanner } from "./github.mjs";
import { renderSecopsDashboard } from "./dashboard.mjs";

const configuration = secopsConfiguration();
const verifier = createRequiredAgenticAppJwtVerifier({ appId: "secops", disabled: process.env.AGENTIC_APP_SECOPS_JWT_DISABLED === "true" });
const awsScan = createSecopsAwsService(configuration);
const githubScan = createGithubScanner({ repos: configuration.repos, token: process.env.SECOPS_GITHUB_TOKEN || "", apiBase: process.env.SECOPS_GITHUB_API_URL || "https://api.github.com" });
const port = Number(process.env.SECOPS_APP_PORT || 3045);
const configuredBasePath = process.env.SECOPS_APP_BASE_PATH || "/apps/secops";
const sendJson = (response, status, data) => { response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }); response.end(JSON.stringify(data)); };
const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://localhost");
  const basePath = resolveAgenticAppRuntimeBasePath(request.headers, configuredBasePath, "secops");
  if (["/health/live", "/health/ready", "/healthz"].includes(url.pathname)) return sendJson(response, 200, { ok: true, app: "secops" });
  if (verifier) {
    const verified = await verifier(request.headers);
    if (!verified.ok) return sendJson(response, verified.status, { error: "unauthorized" });
    request.caipeIdentity = verified.identity;
  }
  const auth = authorizeAgenticAppRuntimeRequest({ identity: request.caipeIdentity, appId: "secops", method: request.method, readScope: "secops:read", invokeScope: "secops:agent:invoke", allowDevelopmentBypass: verifier === null });
  if (!auth.ok) return sendJson(response, auth.status, { error: auth.error });
  if (request.method !== "GET" && request.method !== "HEAD") return sendJson(response, 405, { error: "method_not_allowed" });
  if (url.pathname === "/api/context") return sendJson(response, 200, { version: "1.0", appId: "secops", route: "/apps/secops", title: "SecOps review", agentId: configuration.assistantId });
  if (url.pathname === "/api/aws") {
    const profile = url.searchParams.get("profile") || "", region = url.searchParams.get("region") || "";
    if (!configuration.accounts.some((account) => account.profile === profile) || !configuration.regions.includes(region)) return sendJson(response, 400, { error: "Choose a configured AWS account and region." });
    try { return sendJson(response, 200, { data: await awsScan({ profile, region }) }); }
    catch { return sendJson(response, 502, { error: "AWS scope identity could not be verified or the source is unavailable." }); }
  }
  if (url.pathname === "/api/github") {
    const repo = url.searchParams.get("repo") || "";
    if (!configuration.repos.includes(repo)) return sendJson(response, 400, { error: "Choose a configured GitHub repository." });
    return sendJson(response, 200, { data: await githubScan(repo) });
  }
  if (url.pathname === "/" || url.pathname === "") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    return response.end(renderSecopsDashboard({ configuration, basePath, appPath: "/apps/secops" }));
  }
  return sendJson(response, 404, { error: "not_found" });
});
server.listen(port, "0.0.0.0", () => console.log(`SecOps dashboard listening on http://localhost:${server.address().port}`));
