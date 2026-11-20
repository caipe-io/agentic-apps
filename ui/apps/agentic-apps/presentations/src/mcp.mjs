import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { renderSchema } from './schema.mjs';
import { HttpError } from './auth.mjs';
import { DeckValidationError } from './validation.mjs';

function toolFailure(error) {
  const detail = error instanceof DeckValidationError
    ? { code: error.code, path: error.path, message: error.message, suggestion: error.suggestion }
    : error instanceof HttpError
      ? { code: 'PRESENTATION_REQUEST_FAILED', status: error.status, message: error.message }
      : { code: 'PRESENTATION_FAILED', message: 'Presentation operation failed. If valid input still fails, report this integration error rather than repeatedly changing the deck.' };
  const data = { error: detail };
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
}
export async function handleMcp(request, response, body, identity, store) {
  const server = new McpServer({ name: 'presentations', version: '0.1.0' });
  const result = async operation => {
    try { const data = await operation(); return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data }; }
    catch (error) { return toolFailure(error); }
  };
  server.registerTool('presentations_list_templates', {
    description: 'List presentation templates the signed-in user can use. Prefer the is_default template when the user has not chosen one; an explicit user choice takes precedence. Returns IDs, immutable content/profile versions and supported modes; never template bytes. A default never grants access.',
    inputSchema: {}, annotations: { readOnlyHint: true },
  }, () => result(async () => ({ templates: await store.list(identity) })));
  server.registerTool('presentations_plan', {
    description: 'Validate a proposed deck and calculate the actual slide count after density splits before asking the user to approve the outline. Include explicit cover, content, open_items and closing slides when the chosen template contract requires them. Choose an evidence composition per content slide: metrics only for supplied measurements (every group requires a value), comparison/layers for qualitative priorities, timeline for milestones, or flow/ledger. Use 2-3 groups for metrics/comparison and 2-5 for other layouts. Never invent values or use ordinal labels merely to satisfy metrics validation. Prefer varied compositions; never invent facts, dates or relationships. Put visual content in groups and detail in notes, without duplicate bullets. On validation failure, fix the reported field; preserve notes, evidence, selected mode/density and agreed slide count. Do not repeat unchanged failed calls. Returns per-slide compositions for approval. Uses URLs from any authorized source; no source fetching or live fact verification.',
    inputSchema: renderSchema.omit({ approved: true }).shape, annotations: { readOnlyHint: true },
  }, args => result(() => store.plan(identity, args)));
  server.registerTool('presentations_render', {
    description: 'Generate an editable PowerPoint with native editable visual groups or text from user-approved deck JSON and an accessible private template. Call presentations_plan before outline approval. Set approved only after user approval. Citations are source URLs supplied by the agent, never fetched. Mark unsupported statements verify=true to preserve review flags in speaker notes; do not add visible Verify badges or prefixes. Return the actual slide count, review warnings and authenticated download URL. No project required. Does not perform visual QA. Never claim it does.',
    inputSchema: renderSchema.shape, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, args => result(() => store.render(identity, args)));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  response.once('close', () => { void transport.close(); void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(request, response, body);
}
