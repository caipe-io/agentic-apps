export function buildLiteLlmAnomalyInvestigationFormat() {
  const textList = { type: "array", maxItems: 8, items: { type: "string", minLength: 1, maxLength: 1200 } };
  return {
    type: "json_schema",
    schema_id: "litellm.anomaly_investigation.v1",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["status", "sourceSnapshotId", "analysisStartDate", "analysisEndDate", "summary", "findings", "limitations"],
      properties: {
        status: { type: "string", enum: ["complete", "partial", "unavailable"] },
        sourceSnapshotId: { type: "string", maxLength: 64 },
        analysisStartDate: { type: "string", format: "date" },
        analysisEndDate: { type: "string", format: "date" },
        summary: { type: "string", minLength: 1, maxLength: 2400 },
        findings: {
          type: "array", maxItems: 50,
          items: {
            type: "object", additionalProperties: false,
            required: ["model", "assessment", "observations", "hypotheses", "nextSteps", "evidence"],
            properties: {
              model: { type: "string", minLength: 1, maxLength: 500 },
              assessment: { type: "string", enum: ["supported", "inconclusive", "not_supported"] },
              observations: textList,
              hypotheses: textList,
              nextSteps: textList,
              evidence: {
                type: "array", minItems: 1, maxItems: 8,
                items: {
                  type: "object", additionalProperties: false,
                  required: ["tool", "description"],
                  properties: {
                    tool: { type: "string", enum: ["litellm_get_cost_anomalies", "litellm_get_daily_activity", "litellm_get_model_info"] },
                    description: { type: "string", minLength: 1, maxLength: 1200 },
                  },
                },
              },
            },
          },
        },
        limitations: textList,
      },
    },
  };
}

/** Serialized into the iframe; reject mismatched evidence and render only bounded text. */
export function validateLiteLlmAnomalyInvestigation(value, report) {
  const object = (entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry);
  const text = (entry, max) => typeof entry === "string" && entry.trim().length > 0 && entry.length <= max;
  const list = (entry) => Array.isArray(entry) && entry.length <= 8 && entry.every((item) => text(item, 1200));
  if (!object(value) || !["complete", "partial", "unavailable"].includes(value.status) || !text(value.summary, 2400) || !list(value.limitations)) throw new Error("The agent returned an invalid investigation result.");
  if (value.analysisStartDate !== report.range.startDate || value.analysisEndDate !== report.range.endDate) throw new Error("The agent used a different analysis window. Run the investigation again.");
  if (value.status !== "unavailable" && value.sourceSnapshotId !== report.snapshotId) throw new Error("The agent's source snapshot differs from these candidates. Refresh and investigate again.");
  if (!Array.isArray(value.findings) || value.findings.length > 50) throw new Error("The agent returned an invalid finding list.");
  const candidates = new Set(report.findings.map((finding) => finding.model));
  const seen = new Set();
  const findings = value.findings.map((finding) => {
    if (!object(finding) || !text(finding.model, 500) || !candidates.has(finding.model) || seen.has(finding.model)) throw new Error("The agent returned an unknown or duplicate candidate model.");
    if (!["supported", "inconclusive", "not_supported"].includes(finding.assessment) || ![finding.observations, finding.hypotheses, finding.nextSteps].every(list)) throw new Error("The agent returned an invalid assessment.");
    if (!Array.isArray(finding.evidence) || !finding.evidence.length || finding.evidence.length > 8 || finding.evidence.some((entry) => !object(entry) || !["litellm_get_cost_anomalies", "litellm_get_daily_activity", "litellm_get_model_info"].includes(entry.tool) || !text(entry.description, 1200))) throw new Error("The agent did not cite usable MCP evidence for a finding.");
    seen.add(finding.model);
    return { model: finding.model, assessment: finding.assessment, observations: finding.observations, hypotheses: finding.hypotheses, nextSteps: finding.nextSteps, evidence: finding.evidence.map(({ tool, description }) => ({ tool, description })) };
  });
  if (value.status === "complete" && seen.size !== candidates.size) throw new Error("The agent did not assess every candidate. A partial result is required.");
  if (value.status === "unavailable" && findings.length) throw new Error("An unavailable investigation cannot contain completed findings.");
  return { status: value.status, summary: value.summary, findings, limitations: value.limitations };
}
