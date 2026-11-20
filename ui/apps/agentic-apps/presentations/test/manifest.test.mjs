import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PRESENTATIONS_MANIFEST } from '../manifest.mjs';

const requests = [
  ['GET', '/'], ['GET', '/client.js'], ['GET', '/api/config'], ['GET', '/api/templates'],
  ['GET', '/api/artifacts'], ['GET', '/artifacts/example-id'], ['POST', '/api/templates'],
  ['PUT', '/api/templates/example-id'], ['POST', '/mcp'],
  ['PUT', '/api/artifacts/example-id/retention'], ['DELETE', '/api/artifacts/example-id'],
];

test('presentation registration preserves app identity, tools and explicit route policies', () => {
  const manifest = PRESENTATIONS_MANIFEST;
  assert.equal(manifest.id, 'presentations');
  assert.equal(manifest.apiVersion, '2.0');
  assert.equal(manifest.displayName, 'Presentation Generator');
  assert.equal(manifest.runtime.mountPath, '/apps/presentations');
  assert.equal(manifest.auth.mode, 'forward-user-access-token');
  assert.deepEqual(manifest.provides.mcp, ['presentations']);
  assert.deepEqual(manifest.api.mounts, []);
  assert.equal(manifest.access.policyActions.length, requests.length);
  assert.ok(manifest.access.policyActions.every(policy => !policy.path.includes('*') && policy.defaultEffect === 'allow'));
});

test('canonical host SDK allows actual app requests and rejects undeclared writes', { skip: !process.env.CAIPE_APP_SDK_ROOT }, async () => {
  const sdk = await import(pathToFileURL(resolve(process.env.CAIPE_APP_SDK_ROOT, 'agentic-app-manifest.mjs')));
  const manifest = JSON.parse(await readFile(new URL('../deploy/app.json', import.meta.url), 'utf8'));
  sdk.validateAgenticAppManifest(manifest);
  for (const [method, path] of requests) assert.equal(sdk.resolveAgenticAppHttpPolicyAction(manifest, method, path)?.defaultEffect, 'allow', `${method} ${path}`);
  for (const [method, path] of [['POST', '/api/artifacts'], ['DELETE', '/api/templates/example-id'], ['PUT', '/api/templates']]) {
    assert.equal(sdk.resolveAgenticAppHttpPolicyAction(manifest, method, path), undefined, `${method} ${path}`);
  }
});
