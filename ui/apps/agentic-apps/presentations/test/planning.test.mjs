import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createPresentationServer } from '../src/server.mjs';
import { PresentationStore } from '../src/storage.mjs';
import { planDeck } from '../src/renderer.mjs';
import { profile, deck } from './fixture.mjs';

const identity = { subject: 'example-user', teams: new Map([['example-team', { role: 'member' }]]) };
const template = { _id: '90b734d0-874c-4be7-a2aa-4a1eae0a0a37', owner_team: 'example-team', shared_with: [], profile, version: 'a'.repeat(64) };
const input = slide => ({ template_id: template._id, version: template.version, deck: { ...deck, slides: [deck.slides[0], slide] } });
const groups = [{ label: 'Primary', items: ['Review the options'] }, { label: 'Secondary', items: ['Agree the next step'] }];

async function withClient(run, failure) {
  // Persistence is a read-only fixture; requests use the real HTTP/MCP SDK path.
  const store = new PresentationStore({ collection: () => ({ findOne: async () => template }) });
  if (failure) store.plan = async () => { throw failure; };
  const server = createPresentationServer({ store, authenticate: async () => identity, profiles: [] });
  const client = new Client({ name: 'example-agent', version: '1.0.0' });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.address().port}/mcp`)));
    await run(client);
  } finally {
    await client.close(); await new Promise(resolve => server.close(resolve));
  }
}

test('metrics requirements are discoverable and missing values identify the exact field; comparison preserves notes', async () => {
  await withClient(async client => {
    const tools = (await client.listTools()).tools;
    const schema = tools.find(tool => tool.name === 'presentations_plan').inputSchema;
    const variants = schema.properties.deck.properties.slides.items.properties.visual.oneOf;
    const metric = variants.find(variant => variant.properties.layout.const === 'metrics');
    assert.ok(metric.properties.groups.items.required.includes('value'));
    assert.equal(metric.properties.groups.maxItems, 3);
    const invalid = input({ title: 'Example priorities', visual: { layout: 'metrics', groups }, notes: 'Retain this full explanation.' });
    const result = await client.callTool({ name: 'presentations_plan', arguments: invalid });
    assert.equal(result.isError, true);
    const text = result.content.map(block => block.text ?? '').join('');
    assert.match(text, /explicit sourced values/);
    assert.match(text, /comparison/);
    assert.match(text, /deck\.slides\[1\]\.visual\.groups\[0\]\.value/);
    assert.match(text, /deck\.slides\[1\]\.visual\.groups\[1\]\.value/);
    const corrected = structuredClone(invalid);
    corrected.deck.slides[1].visual.layout = 'comparison';
    const plan = await client.callTool({ name: 'presentations_plan', arguments: corrected });
    assert.equal(plan.isError, undefined);
    assert.equal(plan.structuredContent.slide_count, 2);
    assert.equal(plan.structuredContent.compositions[1].layout, 'comparison');
    assert.equal(planDeck(corrected.deck, profile).deck.slides[1].notes, invalid.deck.slides[1].notes);
  });
});

test('layout overflow gives structured slide-specific repair guidance without changing the requested appearance', async () => {
  await withClient(async client => {
    const result = await client.callTool({ name: 'presentations_plan', arguments: input({ title: 'Example measures', visual: {
      layout: 'metrics', groups: groups.map(group => ({ ...group, value: '012345678901234567890123' })),
    } }) });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, 'VISUAL_CANVAS_OVERFLOW');
    assert.deepEqual(result.structuredContent.error.path, ['deck', 'slides', 1, 'visual']);
    assert.match(result.structuredContent.error.suggestion, /without changing mode or density/);
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  });
});

test('unexpected failures stay redacted rather than exposing internal exception details', async () => {
  await withClient(async client => {
    const result = await client.callTool({ name: 'presentations_plan', arguments: input({ title: 'Example', visual: { layout: 'comparison', groups } }) });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, 'PRESENTATION_FAILED');
    assert.doesNotMatch(JSON.stringify(result), /private-storage|example-password/);
  }, Object.assign(new Error('mongodb://example-user:example-password@private-storage/'), { status: 500 }));
});
