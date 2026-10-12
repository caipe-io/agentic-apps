import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const hostRoot = process.argv[2];
if (!hostRoot) throw new Error("Usage: node scripts/check-shared-manifests.mjs <CAIPE-checkout>");
const { validateAgenticAppManifest, validateAgenticAppOwnership } = await import(
  pathToFileURL(join(resolve(hostRoot), "ui/native-extension-sdk/agentic-app-manifest.mjs"))
);
const catalog = JSON.parse(await readFile("apps.manifest.json", "utf8"));
const declarations = [];
for (const app of catalog.apps) {
  const declaration = validateAgenticAppManifest(JSON.parse(await readFile(join(app.sourcePath, "deploy/caipe/manifest.json"), "utf8")));
  assert.equal(declaration.id, app.id);
  declarations.push(declaration);
}
validateAgenticAppOwnership(declarations);
const native = validateAgenticAppManifest(JSON.parse(await readFile("ui/apps/agentic-apps/weather/native-package/manifest.json", "utf8")));
assert.equal(native.ui.profiles.find(profile => profile.mode === "native-package").contractVersion, "2.0");
// Hosted-only and native distributions are alternatives for the same app ID.
validateAgenticAppOwnership([...declarations.filter(app => app.id !== native.id), native]);
console.log(`SDK validated ${declarations.length} iframe app manifests and the native/iframe distribution.`);
