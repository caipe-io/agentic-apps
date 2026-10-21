import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

const manifest = JSON.parse(await readFile("apps.manifest.json", "utf8"));
assert.equal(manifest.schemaVersion, "1.0", "apps.manifest.json schema version must be 1.0");
assert.ok(Array.isArray(manifest.apps) && manifest.apps.length > 0, "apps.manifest.json must contain apps");

const sourceRoot = resolve("ui/apps/agentic-apps");
const ids = new Set();
const images = new Set();

for (const app of manifest.apps) {
  assert.match(app.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `invalid app id: ${app.id}`);
  assert.match(app.image, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${app.id}: invalid image name`);
  assert.ok(!ids.has(app.id), `${app.id}: duplicate app id`);
  assert.ok(!images.has(app.image), `${app.id}: duplicate image name`);
  ids.add(app.id);
  images.add(app.image);

  const appPath = resolve(app.sourcePath);
  assert.ok(appPath === sourceRoot || appPath.startsWith(`${sourceRoot}${sep}`), `${app.id}: source path escapes app root`);
  assert.equal(appPath, resolve(sourceRoot, app.id), `${app.id}: sourcePath must match its id`);
  assert.equal(resolve(app.serverPath), resolve(appPath, "server.mjs"), `${app.id}: serverPath must be server.mjs in sourcePath`);
  if (app.dockerfile) {
    assert.match(app.dockerfile, /^build\/Dockerfile\.[a-z0-9-]+$/, `${app.id}: invalid Dockerfile`);
    await access(resolve(app.dockerfile));
  }
  await access(appPath);
  await access(resolve(app.serverPath));
  assert.equal(Number.isInteger(app.port) && app.port >= 1 && app.port <= 65535, true, `${app.id}: invalid port`);
}

const appIndex = process.argv.indexOf("--app");
const selection = appIndex < 0 ? "all" : process.argv[appIndex + 1];
assert.ok(selection === "all" || ids.has(selection), "Unknown application selection");
const selectedApps = selection === "all" ? manifest.apps : manifest.apps.filter(app => app.id === selection);
if (process.argv.includes("--matrix")) {
  process.stdout.write(JSON.stringify({ include: selectedApps.map(app => ({ ...app, dockerfile: app.dockerfile || "build/Dockerfile.agentic-app" })) }));
} else {
  console.log(`Validated image build manifest for ${manifest.apps.length} apps.`);
}
