import assert from "node:assert/strict";
import test from "node:test";

import { pathForRepository, repositoryFromPath } from "./routes.mjs";

test("encodes and decodes a repository deep link", () => {
  assert.equal(pathForRepository("example-team/example.repo"), "/sdlc/example-team/example.repo");
  assert.equal(repositoryFromPath("/sdlc/example-team/example.repo"), "example-team/example.repo");
});

test("rejects paths outside the native route and unsafe repository parts", () => {
  assert.equal(repositoryFromPath("/apps/agentic-sdlc/example-team/example.repo"), "");
  assert.equal(repositoryFromPath("/sdlc/example-team/%2F"), "");
  assert.equal(pathForRepository("../example.repo"), null);
  assert.equal(pathForRepository("example-team/a/b"), null);
});
