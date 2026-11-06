import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(new URL("./package.json", import.meta.url));
const ts = require("typescript"), React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
const module = {exports:{}};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("./src/components/agentic-sdlc/ReviewBody.tsx", import.meta.url), "utf8"), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX},
}).outputText, {module, exports: module.exports, require});
const render = body => renderToStaticMarkup(React.createElement(module.exports.ReviewBody, {body}));
test("findings use semantic severity labels, readable titles and collapsed evidence", () => {
  const html = render("**🟠 Major · Security**\n**Check ownership before reading.**\n\nAn unauthorized caller can read `document.body`.\n\n<details><summary>🔬 Evidence</summary>\n\n- Route calls the store before authorization.\n- [Source](https://github.com/example/repo/pull/1)\n\n</details>");
  assert.match(html, /review-status-warning/);
  assert.match(html, /Major · Security/);
  assert.match(html, /<strong>Check ownership/);
  assert.match(html, /<details[^>]*><summary/);
  assert.doesNotMatch(html, /<details[^>]*open/);
  assert.match(html, /rel="noreferrer"/);
});
test("untrusted Markdown cannot introduce executable HTML, images or links", () => {
  const html = render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[click](javascript:alert(1))\n\n<details onclick="alert(1)"><summary>bad</summary>raw</details>');
  assert.doesNotMatch(html, /<script|<img|href="javascript|<details onclick/);
  assert.match(html, /&lt;script&gt;/);
});
test("color is accompanied by text and ordinary comments remain readable", () => {
  for (const level of ["Critical", "Major", "Minor"]) assert.ok(render(`**${level} · Correctness**\n\nEvidence`).includes(`${level} · Correctness`));
  assert.match(render("Plain review with <unknown> text"), /Plain review with &lt;unknown&gt; text/);
});
