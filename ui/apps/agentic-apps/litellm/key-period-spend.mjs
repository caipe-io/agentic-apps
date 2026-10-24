/** Derive calendar-period spend from key-attributed activity, never budget counters. */
export function buildLiteLlmKeyPeriodSpend({ responses, range }) {
  const spendByKey = new Map();
  const seenDates = new Set();
  let totalSpend = 0;
  const unavailable = () => ({ complete: false, spendByKey: new Map(), totalSpend: null, warnings: ["Current-month key spend is unavailable: key activity does not reconcile with gateway totals. Budget-cycle counters are not used as monthly spend."] });
  for (const response of responses) {
    if (!Array.isArray(response?.results) || response.metadata?.has_more || Number(response.metadata?.total_pages) > 1) return unavailable();
    for (const day of response.results) {
      const date = day.date ?? day.start_date ?? day.day;
      if (typeof date !== "string" || date < range.startDate || date > range.endDate || seenDates.has(date)) return unavailable();
      seenDates.add(date);
      const spend = readSpend(day.metrics ?? day);
      if (spend === null) return unavailable();
      const keys = day.breakdown?.api_keys ?? day.api_keys;
      if ((!keys || typeof keys !== "object" || Array.isArray(keys)) && spend !== 0) return unavailable();
      let attributedSpend = 0;
      for (const [id, row] of Object.entries(keys ?? {})) {
        const amount = readSpend(row?.metrics ?? row);
        if (amount === null) return unavailable();
        attributedSpend += amount;
        spendByKey.set(id, (spendByKey.get(id) ?? 0) + amount);
      }
      if (Math.abs(attributedSpend - spend) > Math.max(0.01, Math.abs(spend) * 0.000001)) return unavailable();
      totalSpend += spend;
    }
  }
  if (!seenDates.size && !responses.every((response) => readSpend({ spend: response.metadata?.total_spend }) === 0)) return unavailable();
  return { complete: true, spendByKey, totalSpend, warnings: [] };
}

function readSpend(value) {
  const raw = value?.spend ?? value?.total_spend ?? value?.cost;
  return raw !== null && raw !== undefined && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null;
}
