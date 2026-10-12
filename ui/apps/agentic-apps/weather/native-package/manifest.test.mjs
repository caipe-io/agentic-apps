import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { WEATHER_MANIFEST } from "../manifest.mjs";

const manifest = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8"));
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

test("publishes a shared manifest with two profiles and the existing native ABI", () => {
  assert.equal(manifest.apiVersion, "2.0");
  assert.equal(manifest.version, pkg.version);
  assert.deepEqual(manifest.ui.profiles, [
    { id: "native", mode: "native-package", package: pkg.name, contractVersion: "1.1" },
    { id: "hosted", mode: "iframe" },
  ]);
  assert.equal(manifest.ui.navigation.routeRef, manifest.ui.routes[0].id);
  assert.equal(manifest.ui.routes[0].path, "/weather");
  assert.equal(manifest.runtime.mountPath, WEATHER_MANIFEST.runtime.mountPath);
});

test("preserves gateway policy, scopes, and existing registry references", () => {
  assert.equal(manifest.auth.mode, "app-scoped-token");
  assert.deepEqual(manifest.access.tokenScopes, WEATHER_MANIFEST.access.tokenScopes);
  assert.deepEqual(manifest.access.requiredRoles, WEATHER_MANIFEST.access.requiredRoles);
  assert.deepEqual(manifest.access.policyActions, WEATHER_MANIFEST.access.policyActions);
  assert.deepEqual(manifest.provides.agents, [WEATHER_MANIFEST.assistant.agentId]);
  assert.equal(manifest.runtime.origin, undefined);
  assert.equal(manifest.grants, undefined);
  assert.deepEqual(manifest.requestedPermissions, []);
});

test("does not require native-only host capabilities for the iframe profile", () => {
  assert.ok(manifest.consumes.platformApis.every(api => !api.id.startsWith("host.") || !api.required));
  assert.ok(manifest.consumes.platformApis.some(api => api.id === "app.gateway" && api.required));
});
