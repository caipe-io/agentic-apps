# Skill provenance calibration

Three immutable synthetic-source cases were evaluated with the existing
`bedrock/global.anthropic.claude-sonnet-5-5` model adapter and provider-default
reasoning. Expected rubrics were withheld; only fixture-backed reads/searches
were exposed. No GitHub writes, production review runs, repository execution or
configuration changes were available to the model.

| Case | Expected/result | Report metadata |
| --- | --- | --- |
| Unscoped project query | findings | Review usage and finding discovery/verification parsed successfully; finding IDs were a subset of review usage. |
| Project scope in helper | no_findings | Review usage parsed successfully; no finding attribution was invented. |
| Missing essential helper | incomplete | Empty simulated public review body and no findings. |

All three semantic outcomes matched. Two completions were strict JSON. The
finding case returned a fenced JSON envelope: the captured adapter harness
recovered that envelope and recorded `format_valid: false`; this is not a
strict-format pass. Its embedded, single-line review/comment skill markers
parsed without repair using the same parser as the dashboard. The portable
`evaluate.mjs --provenance` runner retains invalid envelopes for manual
inspection rather than silently fixing them. Full returned outputs and source
read traces are in `skill-provenance-results.jsonl`.

The finding case reported four applied methods, the guarded case three, and
neither automatically claimed all five configured methods. These are
reviewer-reported method attributions within one combined model context. They
do not prove separate plugin execution or causal ownership of a finding, and
three small cases do not establish production recall or provenance accuracy.
Historical reviews remain unmodified and unknown.
