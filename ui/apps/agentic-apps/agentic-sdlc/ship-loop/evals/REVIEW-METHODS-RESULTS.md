# Adapted review methods v1 calibration

Model: `bedrock/global.anthropic.claude-sonnet-5-5`, using the existing production model adapter and provider-default reasoning (the adapter reports no configurable reasoning support). One trial per case/variant. Both variants retain inspection v2; baseline removes only the adapted methods block. Ten synthetic immutable source snapshots, including known defects, guarded controls and an incomplete-source case. Expected rubrics were not sent to the model. The only exposed tools were fixture-backed reads/searches: no production GitHub, publication, file execution or database tools.

| Case | Expected | Baseline | Methods v1 |
| --- | --- | --- | --- |
| assist-rejects-authorized-note-creators | findings | findings | findings |
| budget-enforced-in-middleware | no_findings | no_findings | no_findings |
| compatibility-alias-preserves-consumer | no_findings | no_findings | no_findings |
| new-route-loses-call-budget | findings | findings | findings |
| renamed-export-breaks-unchanged-consumer | findings | findings | findings |
| steward-only-note-controls | no_findings | no_findings | no_findings |
| tenant-query-guarded | no_findings | no_findings | no_findings |
| tenant-query-unscoped | findings | findings | findings |
| unindexed-import-readable-at-head | no_findings | no_findings | no_findings |
| unverified-prior-finding-is-incomplete | incomplete | incomplete | incomplete |

Both variants matched all ten semantic outcomes. All 20 completions were strict JSON. Candidate findings were checked against the expected trigger, changed-code cause and impact; guarded controls had no findings, and the missing essential helper remained incomplete. Full synthetic outputs and source-read traces are in `review-methods-v1-results.jsonl`.

**This shows no measured recall improvement:** the baseline already passed these small cases. It supports a limited regression check before wider blinded evaluation; it does not establish production precision/recall or tool reliability. No live saved reviewer was changed or production review posted by this evaluation. The application tests separately verify default-prompt integration and existing publication safeguards.
