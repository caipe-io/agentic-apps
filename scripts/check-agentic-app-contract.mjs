import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const apps = [
  ["agentic-sdlc", "Agentic SDLC", "/apps/agentic-sdlc"],
  ["finops", "FinOps Command Center", "/apps/finops"],
  ["weather", "Weather Lab", "/apps/weather"],
  ["litellm", "LiteLLM Usage Dashboard", "/apps/litellm-usage-dashboard"],
  ["oss-repo-management", "OSS Repo Report Card", "/apps/oss-repo-management"],
  ["jira-project-dashboard", "Jira Project Dashboard", "/apps/jira-project-dashboard"],
];

const sourceRoot = "ui/apps/agentic-apps";

for (const [appId, expectedName, expectedMountPath] of apps) {
  const appRoot = join(sourceRoot, appId);
  const manifestModule = await import(pathToFileURL(join(appRoot, "manifest.mjs")));
  const manifest = Object.values(manifestModule).find(
    (value) => value && typeof value === "object" && value.id === appId,
  );
  assert.ok(manifest, `${appId}: manifest export is missing`);
  assert.equal(manifest.displayName, expectedName, `${appId}: display name drifted`);
  assert.equal(manifest.runtime.mountPath, expectedMountPath, `${appId}: mount path drifted`);
  assert.equal(manifest.runtime.chrome, "iframe", `${appId}: runtime must use the iframe chrome contract`);
  assert.equal(manifest.ui.surface, "hosted", `${appId}: UI surface must be hosted`);
  assert.equal(manifest.assistant?.enabled, true, `${appId}: assistant must be enabled`);
  assert.ok(manifest.assistant?.agentId, `${appId}: assistant agent binding is missing`);
  assert.equal(manifest.health?.endpoint, "/health/ready", `${appId}: readiness endpoint drifted`);

  const registration = JSON.parse(await readFile(join(appRoot, "deploy/caipe/agentic-app.json"), "utf8"));
  assert.equal(registration.runtime?.type, "remote", `${appId}: runtime type must be remote`);
  assert.ok(registration.runtime?.target, `${appId}: runtime target is missing`);
  assert.equal(registration.visibility, "private", `${appId}: registration must default to private visibility`);
  assert.equal(registration.createdBy, "deployment-owner", `${appId}: registration owner is missing`);
  assert.equal(registration.assistant?.name, manifest.assistant.agentName, `${appId}: assistant name drifted`);
  assert.ok(registration.assistant?.label, `${appId}: assistant popup label is missing`);
  assert.deepEqual(
    registration,
    {
      ...registration,
      id: appId,
      name: expectedName,
      runtime: { ...registration.runtime, mountPath: expectedMountPath },
      assistant: {
        ...registration.assistant,
        agentId: manifest.assistant.agentId,
        contextEndpoint: "/api/context",
      },
      healthEndpoint: "/health/ready",
    },
    `${appId}: registration shape is invalid`,
  );
  assert.deepEqual(
    [...registration.requiredScopes].sort(),
    [...manifest.access.tokenScopes].sort(),
    `${appId}: registration scopes do not match the manifest`,
  );

  const server = await readFile(join(appRoot, "server.mjs"), "utf8");
  for (const requiredText of [
    '"/health/live", "/health/ready", "/healthz"',
    'url.pathname === "/api/context"',
    "caipe.agenticApp.context.v1",
    "caipe.agenticApp.assistant.open.v1",
    'version: "1.0"',
    "window.location.origin",
  ]) {
    assert.ok(server.includes(requiredText), `${appId}: missing ${requiredText}`);
  }
}

console.log(`Validated latest Agentic App registration and popup contract for ${apps.length} apps.`);
