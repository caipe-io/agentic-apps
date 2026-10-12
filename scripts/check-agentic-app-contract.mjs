import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const apps = [
  ["agentic-sdlc", "Agentic SDLC", "/apps/agentic-sdlc"],
  ["finops", "FinOps Command Center", "/apps/finops"],
  ["weather", "Weather Lab", "/apps/weather"],
  ["litellm", "LiteLLM Usage Dashboard", "/apps/litellm"],
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
  assert.equal(manifest.apiVersion, "2.0", `${appId}: shared app manifest version must be 2.0`);
  assert.equal(manifest.version, JSON.parse(await readFile("package.json", "utf8")).version, `${appId}: publisher version drifted`);
  assert.equal(manifest.displayName, expectedName, `${appId}: display name drifted`);
  assert.equal(manifest.runtime.mountPath, expectedMountPath, `${appId}: mount path drifted`);
  assert.deepEqual(manifest.ui.profiles, [{ id: "hosted", mode: "iframe" }], `${appId}: UI profile must be hosted`);
  assert.deepEqual(manifest.ui.routes, [{ id: "home", path: expectedMountPath }], `${appId}: canonical route drifted`);
  assert.ok(manifest.ui.assistant?.agentId, `${appId}: assistant agent reference is missing`);
  assert.equal(manifest.runtime.origin, undefined, `${appId}: private origins belong in installation bindings`);
  assert.deepEqual(manifest.requestedPermissions, [], `${appId}: migration must not request new permissions`);
  assert.equal(manifest.health?.endpoint, "/health/ready", `${appId}: readiness endpoint drifted`);

  const registration = JSON.parse(await readFile(join(appRoot, "deploy/caipe/agentic-app.json"), "utf8"));
  assert.equal(registration.runtime?.type, "remote", `${appId}: runtime type must be remote`);
  assert.ok(registration.runtime?.target, `${appId}: runtime target is missing`);
  assert.equal(registration.visibility, "private", `${appId}: registration must default to private visibility`);
  assert.equal(registration.createdBy, "deployment-owner", `${appId}: registration owner is missing`);
  assert.equal(registration.assistant?.name, manifest.ui.assistant.name, `${appId}: assistant name drifted`);
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
        agentId: manifest.ui.assistant.agentId,
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

  if (appId === "jira-project-dashboard") {
    assert.ok(
      server.includes("response_format:"),
      `${appId}: dashboard invocation must provide its structured response schema`,
    );
    assert.ok(
      !server.includes("ensureStructuredResponseAgent"),
      `${appId}: runtime agent metadata must not block a request-scoped response format`,
    );
  }
}

console.log(`Validated shared AgenticAppManifest 2.0 and legacy seed/context compatibility for ${apps.length} apps.`);
