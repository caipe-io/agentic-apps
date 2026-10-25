#!/usr/bin/env node

import { createServer } from "node:http";
import { createRequiredAgenticAppJwtVerifier } from "../../_lib/jwt-verify.mjs";
import { authorizeAgenticAppRuntimeRequest } from "../../_lib/runtime-authorization.mjs";
import { resolveAgenticAppRuntimeBasePath, resolveAgenticAppSurface } from "../../_lib/runtime-base-path.mjs";
import { renderEc2Dashboard } from "./dashboard.mjs";
import { ec2Configuration, resolveEc2Scope } from "./inventory.mjs";
import { buildEc2AnomalyRequest } from "./anomalies.mjs";
import { createAwsInventoryService } from "./sdk-inventory.mjs";

const configuration = ec2Configuration();
const inventory = createAwsInventoryService(configuration);
const configuredBasePath = String(process.env.EC2_APP_BASE_PATH || "/apps/ec2").replace(/\/+$/, "");
const verifier = createRequiredAgenticAppJwtVerifier({ appId: "ec2", disabled: process.env.AGENTIC_APP_EC2_JWT_DISABLED === "true" });

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://localhost");
  if (["/health/live", "/health/ready", "/healthz"].includes(url.pathname)) {
    sendJson(response, 200, { ok: true, app: "ec2", dataSource: "aws-sdk", investigations: "mcp-aws-via-agent", agentId: configuration.agentId });
    return;
  }
  if (verifier) {
    const verified = await verifier(request.headers);
    if (!verified.ok) { sendJson(response, verified.status, { error: "unauthorized" }); return; }
    request.caipeIdentity = verified.identity;
  }
  const authorization = authorizeAgenticAppRuntimeRequest({ identity: request.caipeIdentity, appId: "ec2", method: request.method, readScope: "ec2:read", invokeScope: "ec2:agent:invoke", allowDevelopmentBypass: verifier === null });
  if (!authorization.ok) { sendJson(response, authorization.status, { error: authorization.error, requiredScope: authorization.requiredScope }); return; }

  const readRequest = ["GET", "HEAD"].includes(request.method);
  if (url.pathname === "/api/context" && readRequest) {
    sendJson(response, 200, { version: "1.0", appId: "ec2", route: configuredBasePath, title: "EC2 instances", agentId: configuration.agentId, mcpServerId: "mcp-aws", domainAnswersRequireMcp: true, suggestedPrompts: ["Which instances should I investigate for cost savings?", "Show the OS and tags for the selected instance.", "Compare instance sizes using current AWS pricing."] });
  } else if (url.pathname === "/api/config" && readRequest) {
    sendJson(response, 200, { success: true, data: configuration });
  } else if (["/api/inventory", "/api/instance"].includes(url.pathname) && readRequest) {
    try {
      const scope = resolveEc2Scope({ profile: url.searchParams.get("profile") ?? "", region: url.searchParams.get("region") }, configuration);
      const cursor = url.searchParams.get("cursor") || "";
      const instanceId = url.pathname === "/api/instance" ? url.searchParams.get("instanceId") || "" : "";
      if (cursor.length > 8192 || /[\u0000-\u001f]/.test(cursor)) throw new Error("Invalid AWS pagination token.");
      if (url.pathname === "/api/instance" && !/^i-[a-f0-9]{8}(?:[a-f0-9]{9})?$/.test(instanceId)) throw new Error("Choose a valid instance ID.");
      const data = await inventory.read(scope, { cursor, instanceId, refresh: url.searchParams.get("refresh") === "1" });
      sendJson(response, 200, { success: true, data });
    } catch (error) {
      console.error("[ec2] AWS inventory request failed", { profile: url.searchParams.get("profile"), region: url.searchParams.get("region"), error: error instanceof Error ? error.name : "UnknownError" });
      sendJson(response, 400, { success: false, error: error instanceof Error ? error.message.slice(0, 500) : "AWS inventory unavailable." });
    }
  } else if (["/api/anomaly-request", "/api/inventory-request"].includes(url.pathname) && request.method === "POST") {
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 32_768) throw new Error("Request too large.");
        chunks.push(chunk);
      }
      const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (input?.kind !== "anomalies") throw new Error("Inventory now uses the AWS SDK. Reload the dashboard.");
      const scope = resolveEc2Scope(input, configuration);
      sendJson(response, 200, { success: true, data: { ...buildEc2AnomalyRequest(input, scope), agentId: configuration.agentId } });
    } catch (error) {
      sendJson(response, 400, { success: false, error: error instanceof Error ? error.message : "Invalid inventory request." });
    }
  } else if ((url.pathname === "/" || url.pathname === "/dashboard") && readRequest) {
    const basePath = resolveAgenticAppRuntimeBasePath(request.headers, configuredBasePath, "ec2");
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(renderEc2Dashboard({ basePath, appPath: configuredBasePath, compact: resolveAgenticAppSurface(request.headers) === "hosted", configuration }));
  } else {
    sendJson(response, 404, { error: "not_found" });
  }
});

server.listen(Number(process.env.EC2_APP_PORT || "3043"), () => console.log(`EC2 Instances Dashboard listening on http://localhost:${server.address().port}`));

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}
