export async function loadForecast(city, { fetchImpl = fetch, signal } = {}) {
  const normalized = String(city ?? "").trim();
  if (!normalized) throw new Error("Enter a city to load weather");

  const response = await fetchImpl("/api/copilotkit/weather-agent", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ city: normalized, intent: "forecast-summary" }),
    signal,
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Weather service returned an invalid response");
  }
  if (!response.ok || !payload?.forecast || typeof payload.forecast !== "object") {
    throw new Error(payload?.message || payload?.error || `Weather request failed (HTTP ${response.status})`);
  }
  return payload.forecast;
}
