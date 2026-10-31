import assert from "node:assert/strict";
import test from "node:test";

import { cityFromPath, pathForCity } from "./routes.mjs";

test("round trips a city deep link", () => {
  assert.equal(pathForCity("San Jose"), "/weather/San%20Jose");
  assert.equal(cityFromPath("/weather/San%20Jose"), "San Jose");
});

test("rejects unsafe or unrelated paths", () => {
  assert.equal(pathForCity("a/b"), null);
  assert.equal(cityFromPath("/apps/weather"), "");
  assert.equal(cityFromPath("/weather/%2F"), "");
});
