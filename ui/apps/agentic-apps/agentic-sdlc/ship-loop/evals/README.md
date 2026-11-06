# Review inspection calibration

`review-inspection.json` contains known defects involving lost call budgets,
broken unchanged consumers and incompatible caller/callee permissions, together
with guarded controls, an incomplete-inspection case and a stale-search-index
control. All examples are synthetic and contain no real repository code or
credentials.

Run these as read-only model evaluations before claiming a policy improves review
quality. Provide `change`, `diff`, and the available file names, plus sandboxed
`read_source(path)` and `search_source(pattern)` tools backed only by that case's
`files` dictionary. Where `search_index` is present, use it for search results
while keeping `read_source` pinned to `files`; an empty default-branch index
must not prevent direct reads of a new PR-head file. Do not give the model `expected`, repository credentials,
network/file-execution tools, or review/comment publication tools.

Use `--policy=methods` (default) to compare the frozen production v0.0.16
handwritten skill with the replacement skill-based reviewer. The archived
`baselines/production-v0.0.16.md` was extracted from app commit
`c37355a53ad2fc6c48a0ac66ead5b28e732205cf`; it is evaluation data, never a
production prompt import. `--policy=inspection` preserves the historical
comparison with/without inspection v2 using only that frozen baseline.

Record the outcome, concrete trigger/impact/source evidence, requested files and
missing evidence. Inspect the reasoning against `expected`; an outcome match
alone is insufficient. Report false positives on the guarded controls as well
as missed defects and unjustified clean results. These small cases are a
calibration check, not a measurement of production recall.

## Repeat the evaluation

Run on the repository's supported Node version with an explicitly chosen
OpenAI-compatible model endpoint. Set `REVIEW_API_BASE_URL`, `REVIEW_API_KEY`
and `REVIEW_MODEL` in the environment, then run:

```sh
node ui/apps/agentic-apps/agentic-sdlc/ship-loop/evals/evaluate.mjs --variant=both --gateway-snapshot=/path/to/scanned-original-catalog.json
```

Use `--case=<id>` for one case and optionally `REVIEW_REASONING_EFFORT` only
when supported by the chosen model. The runner emits JSONL and permits only
fixture-backed reads/searches. It never sends the expected rubric to the model,
and cannot invoke a repository, write a review or execute suggested code.
Inspect invalid-format responses and errors instead of silently discarding them.

The replacement reads original discovery/security/verification files unchanged
from an exported, scanned GitHub Hub catalog. Supply all five packages with
content, ancillary files, scan state and source metadata. The runner validates
the pinned upstream bytes; a missing or altered package aborts. CAIPE runtime
and publication constraints remain separate. No upstream plugin or publication
tools are invoked by this evaluation.

For simulated skill-report metadata, add `--provenance --variant=candidate` and
select `--case=tenant-query-unscoped`, `tenant-query-guarded`, or
`unverified-prior-finding-is-incomplete`. The simulation uses task
`calibration-task` and a fixed 40-character `a` SHA; outputs are never posted.
The portable runner keeps strict JSON failures visible instead of repairing
formatting. See SKILL-PROVENANCE-RESULTS.md for the captured model run and limits.
