# Skill-based reviewer replacement calibration

Baseline: the frozen released v0.0.16 custom skill from `c37355a53ad2fc6c48a0ac66ead5b28e732205cf`. Its contents were checked against that exact source commit. Candidate: adapted Sentry/Trail of Bits/Anthropic skills as the methodology, with only CAIPE runtime and publication constraints. Unlike an additive comparison, the candidate does not include the custom inspection-v2/checklist text.

Model: `bedrock/global.anthropic.claude-sonnet-5-5`, existing production model adapter, provider-default reasoning. One trial per case/variant. Expected rubrics were withheld; only immutable fixture-backed reads/searches were exposed. No repository publication, execution, database or production agent configuration tools were available to the model.

**Partial result: 15 of 20 completions returned before the Kubernetes exec connection dropped. A follow-up access check returned Unauthorized. All 15 returned completions were strict JSON and matched their expected semantic outcomes. Five case/variant evaluations remain unverified; do not count them as passes.**

| Case | Expected | Released baseline | Skill-based replacement |
| --- | --- | --- | --- |
| new-route-loses-call-budget | findings | findings | not returned |
| budget-enforced-in-middleware | no_findings | no_findings | no_findings |
| renamed-export-breaks-unchanged-consumer | findings | findings | findings |
| compatibility-alias-preserves-consumer | no_findings | not returned | no_findings |
| unverified-prior-finding-is-incomplete | incomplete | incomplete | incomplete |
| unindexed-import-readable-at-head | no_findings | not returned | not returned |
| assist-rejects-authorized-note-creators | findings | findings | findings |
| steward-only-note-controls | no_findings | no_findings | not returned |
| tenant-query-unscoped | findings | findings | findings |
| tenant-query-guarded | no_findings | no_findings | no_findings |

Returned findings were inspected for their concrete trigger, changed-code cause and impact, rather than accepting only the outcome labels. Returned guarded controls had no false positives, and the unavailable essential helper remained incomplete. Full returned synthetic outputs and source-read traces are in `review-methods-v1-results.jsonl`.

This is a small, partial regression calibration, not a measurement of production recall or evidence of improvement. Finish the missing evaluations and use larger blinded cases before making either claim. Existing production saved reviewer prompts were not changed. The local application tests separately verify default-prompt integration and publication safeguards.
