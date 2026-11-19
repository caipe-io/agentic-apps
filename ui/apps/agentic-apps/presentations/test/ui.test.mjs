import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { clientScript, page, readHostAppearance } from '../src/ui.mjs';

test('appearance accepts only the matching same-origin parent and limits context to theme preferences', () => {
  const parent = {};
  const origin = 'https://host.example.test';
  const event = { origin, source: parent, data: { type: 'caipe.microfrontend.initialize.v1', version: '1.0', appId: 'presentations', context: { theme: 'light', preferences: { shadows_enabled: false }, token: 'untrusted', css: 'untrusted' } } };
  assert.deepEqual(readHostAppearance(event, origin, parent), { theme: 'light', shadows: false });
  for (const change of [{ origin: 'https://other.example.test' }, { source: {} }, { data: { ...event.data, appId: 'other' } }, { data: { ...event.data, version: '2.0' } }, { data: { ...event.data, type: 'untrusted' } }, { data: null }]) {
    assert.equal(readHostAppearance({ ...event, ...change }, origin, parent), null);
  }
  assert.deepEqual(readHostAppearance({ ...event, data: { ...event.data, context: { theme: 'url(untrusted)', preferences: { shadows_enabled: 'false' } } } }, origin, parent), { theme: undefined, shadows: undefined });
});

test('served browser module parses as JavaScript', () => {
  assert.doesNotThrow(() => new Script(clientScript));
});

test('creation links request a fresh bound app assistant instead of resuming global chat', () => {
  const html = page('/apps/presentations');
  assert.match(html, /href="\/apps\/presentations\?assistant_chat=new"/);
  assert.doesNotMatch(html, /href="\/chat"/);
  assert.match(clientScript, /link.href=base\+'\?assistant_chat=new'/);
});
