import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(new URL("./package.json", import.meta.url));
const ts = require("typescript"),
  React = require("react"),
  { renderToStaticMarkup } = require("react-dom/server");
const source = readFileSync(
  new URL("./src/components/agentic-sdlc/ReviewSkills.tsx", import.meta.url),
  "utf8",
);
const module = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText,
  { module, exports: module.exports, require },
);
const { ReviewSkills, FindingSkills } = module.exports;
const render = (component, report) =>
  renderToStaticMarkup(React.createElement(component, { report }));

test("legacy and unverified review evidence cannot appear as a used skill", () => {
  for (const report of [
    undefined,
    { status: "not_recorded", used: [] },
    { status: "unverified", used: [] },
  ]) {
    const html = render(ReviewSkills, report);
    assert.match(html, /recorded|verified/);
    assert.doesNotMatch(html, /href=/);
    assert.doesNotMatch(html, /Sentry|Trail of Bits|Anthropic/);
  }
});

test("recorded usage and discovery/verification have separate, attributed labels", async () => {
  const { REVIEW_SKILL_CATALOG } = await import(
    "./src/lib/agentic-sdlc/review-skills.mjs"
  );
  const discovery = REVIEW_SKILL_CATALOG[0],
    verification = REVIEW_SKILL_CATALOG[2];
  const used = render(ReviewSkills, {
    status: "reported",
    used: [discovery, verification],
  });
  assert.match(used, /reviewer reported/);
  assert.match(used, /Sentry · Find Bugs/);
  const finding = render(FindingSkills, {
    status: "reported",
    foundBy: [discovery],
    verifiedBy: [verification],
    headSha: "a".repeat(40),
  });
  assert.match(finding, /Discovery:/);
  assert.match(finding, /Verification:/);
  assert.match(finding, /recorded at/);
  assert.match(finding, /Trail of Bits · FP Check/);
});

test("unattributed stages stay unknown and human comments need no attribution section", () => {
  assert.equal(render(FindingSkills, null), "");
  const html = render(FindingSkills, {
    status: "reported",
    foundBy: [],
    verifiedBy: [],
    headSha: "a".repeat(40),
  });
  assert.match(html, /Not recorded/);
  assert.doesNotMatch(html, /href=/);
});
