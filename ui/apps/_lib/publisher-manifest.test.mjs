import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const catalog = JSON.parse(await readFile("apps.manifest.json", "utf8"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));

for (const app of catalog.apps) {
  test(`${app.id}: shares one 2.0 declaration and preserves legacy scope/agent bindings`, async () => {
    const root = app.sourcePath;
    const declaration = JSON.parse(await readFile(join(root, "deploy/caipe/manifest.json"), "utf8"));
    const module = await import(pathToFileURL(join(process.cwd(), root, "manifest.mjs")));
    const exported = Object.values(module).find(value => value?.id === app.id);
    const legacy = JSON.parse(await readFile(join(root, "deploy/caipe/agentic-app.json"), "utf8"));
    assert.deepEqual(exported, declaration);
    assert.equal(declaration.apiVersion, "2.0");
    assert.equal(declaration.version, pkg.version);
    assert.deepEqual(declaration.ui.profiles, [{ id: "hosted", mode: "iframe" }]);
    assert.equal(declaration.runtime.origin, undefined);
    assert.equal(declaration.auth.mode, "app-scoped-token");
    assert.deepEqual([...declaration.access.tokenScopes].sort(), [...legacy.requiredScopes].sort());
    assert.equal(declaration.ui.assistant.agentId, legacy.assistant.agentId);
    assert.deepEqual(declaration.requestedPermissions, []);
    assert.equal(declaration.grants, undefined);
    assert.ok(declaration.access.policyActions.every(policy => (policy.requiredScopes ?? []).every(scope => declaration.access.tokenScopes.includes(scope))));
  });
}
