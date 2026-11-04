// Explicit, read-only evaluation. No production agent, repository or publication tools.
import { readFile } from "node:fs/promises";
import { CONFORMANCE_SKILL } from "../src/lib/agentic-sdlc/review-policy.ts";

if (!process.env.REVIEW_API_BASE_URL) throw new Error("Set REVIEW_API_BASE_URL explicitly.");
const base = new URL(process.env.REVIEW_API_BASE_URL);
if (base.protocol !== "https:" || base.username || base.password)
  throw new Error("Use an HTTPS model API URL without embedded credentials.");
const key = process.env.REVIEW_API_KEY;
const model = process.env.REVIEW_MODEL;
if (!key || !model) throw new Error("Set REVIEW_API_KEY and REVIEW_MODEL explicitly.");
const endpoint = new URL(`${base.pathname.replace(/\/$/, "")}/chat/completions`, base);
const dataset = JSON.parse(await readFile(new URL("./review-inspection.json", import.meta.url), "utf8"));
const legacySkill = (await readFile(new URL("./baselines/production-v0.0.16.md", import.meta.url), "utf8")).trimEnd();
const legacyInspection = legacySkill.match(/<!-- caipe-pr-inspection-policy:v2 -->[\s\S]*?<!-- \/caipe-pr-inspection-policy:v2 -->/)?.[0];
if (!legacyInspection) throw new Error("Missing frozen inspection baseline.");
const variant = process.argv.find(arg => arg.startsWith("--variant="))?.split("=")[1] || "both";
if (!["baseline", "candidate", "both"].includes(variant)) throw new Error("Invalid variant.");
const policyName = process.argv.find(arg => arg.startsWith("--policy="))?.split("=")[1] || "methods";
if (!["inspection", "methods"].includes(policyName)) throw new Error("Invalid policy.");
const caseId = process.argv.find(arg => arg.startsWith("--case="))?.split("=")[1];
const cases = dataset.cases.filter(item => !caseId || item.id === caseId);
if (!cases.length) throw new Error("Unknown evaluation case.");
const provenance = process.argv.includes("--provenance");
const outputSchema = provenance
  ? `Return JSON only: {"outcome":"findings|no_findings|incomplete","review_body":"simulated review text with the single-line skill report marker, or empty if incomplete","findings":[{"path":"...","trigger":"...","impact":"...","fix":"...","body":"simulated new inline comment including finding-skill attribution marker"}],"limits":["..."]}. For this simulation the trusted task is calibration-task and the reviewed SHA is ${"a".repeat(40)}. Output strings only; do not publish anything. Record applied methods honestly. For incomplete inspection do not simulate a public review body.`
  : 'Return JSON only: {"outcome":"findings|no_findings|incomplete","findings":[{"path":"...","trigger":"...","impact":"...","fix":"..."}],"limits":["..."]}.';
const tools = [
  { type: "function", function: { name: "read_source", description: "Read one supplied repository file at the reviewed head.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } } },
  { type: "function", function: { name: "search_source", description: "Discover references in the supplied search index; only read_source proves head contents.", parameters: { type: "object", properties: { pattern: { type: "string" } }, required: ["pattern"], additionalProperties: false } } },
];
function resultContent(content) {
  const text = content?.trim() || "";
  try { return { result: JSON.parse(text), format_valid: true }; }
  catch { return { result: { outcome: "invalid", raw: text }, format_valid: false }; }
}
async function evaluate(item, name) {
  const selectedPolicy = policyName === "inspection"
    ? (name === "baseline" ? legacySkill.replace(legacyInspection, "") : legacySkill)
    : (name === "baseline" ? legacySkill : CONFORMANCE_SKILL);
  const policy = provenance ? selectedPolicy.replaceAll("TASK_ID", "calibration-task") : selectedPolicy;
  // Deliberately omit expected outcomes and implementations from the initial request.
  const messages = [
    { role: "system", content: `${policy}\n\nOFFLINE READ-ONLY CALIBRATION: This is an open non-draft PR in example/repository at the reviewed head. Only the supplied snapshot tools exist. Do not publish or execute code. ${outputSchema} Missing essential evidence is incomplete.` },
    { role: "user", content: JSON.stringify({ change: item.change, diff: item.diff, files: Object.keys(item.files) }) },
  ];
  const trace = [];
  for (let turn = 0; turn < 12; turn++) {
    const response = await fetch(endpoint, {
      method: "POST", redirect: "error", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, tools, max_tokens: 4096,
        ...(process.env.REVIEW_REASONING_EFFORT ? { reasoning_effort: process.env.REVIEW_REASONING_EFFORT } : {}) }),
      signal: AbortSignal.timeout(150000),
    });
    if (!response.ok) throw new Error(`Model request failed (${response.status}).`);
    const message = (await response.json()).choices?.[0]?.message;
    if (!message) throw new Error("Missing model response.");
    messages.push(message);
    if (!message.tool_calls?.length) return { case: item.id, variant: name, ...resultContent(message.content), trace, expected: item.expected };
    for (const call of message.tool_calls) {
      let value = "TOOL_NOT_AVAILABLE", args = {};
      try {
        args = JSON.parse(call.function.arguments);
        if (call.function.name === "read_source") {
          const path = String(args.path || "").replace(/^\.\//, "");
          value = Object.hasOwn(item.files, path) ? item.files[path] : "SOURCE_UNAVAILABLE";
        } else if (call.function.name === "search_source") {
          const pattern = String(args.pattern || "").toLowerCase();
          value = Object.fromEntries(Object.entries(item.search_index || item.files).filter(([, source]) => source.toLowerCase().includes(pattern)));
        }
      } catch { value = "INVALID_TOOL_ARGUMENTS"; }
      trace.push({ tool: call.function.name, arguments: args });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(value) });
    }
  }
  return { case: item.id, variant: name, result: { outcome: "incomplete", limits: ["Tool-round budget reached"] }, trace, expected: item.expected };
}
for (const item of cases) for (const name of variant === "both" ? ["baseline", "candidate"] : [variant]) {
  try { console.log(JSON.stringify(await evaluate(item, name))); }
  catch (error) { console.log(JSON.stringify({ case: item.id, variant: name, error: error.name })); process.exitCode = 1; }
}
