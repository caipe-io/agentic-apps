import assert from "node:assert/strict";
import test from "node:test";

import { loadForecast } from "./client.mjs";

test("loads weather through the existing app-scoped gateway route", async () => {
  const calls = [];
  const forecast = await loadForecast("San Jose", {
    fetchImpl: async (path, options) => {
      calls.push({ path, options });
      return new Response(JSON.stringify({ forecast: { city: "San Jose", current: { temperatureC: 20 } } }),
        { status: 200 });
    },
  });
  assert.equal(forecast.city, "San Jose");
  assert.equal(calls[0].path, "/api/copilotkit/weather-agent");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.equal(calls[0].options.headers.authorization, undefined);
  assert.deepEqual(JSON.parse(calls[0].options.body), { city: "San Jose", intent: "forecast-summary" });
});

test("reports a provider error without exposing response internals", async () => {
  await assert.rejects(loadForecast("Unknown City", {
    fetchImpl: async () => new Response(JSON.stringify({ message: "Location unavailable" }), { status: 502 }),
  }), /Location unavailable/);
});
