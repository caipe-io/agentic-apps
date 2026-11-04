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

Compare the same model/settings with and without `REVIEW_INSPECTION_POLICY`.
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
node ui/apps/agentic-apps/agentic-sdlc/ship-loop/evals/evaluate.mjs --variant=both
```

Use `--case=<id>` for one case and optionally `REVIEW_REASONING_EFFORT` only
when supported by the chosen model. The runner emits JSONL and permits only
fixture-backed reads/searches. It never sends the expected rubric to the model,
and cannot invoke a repository, write a review or execute suggested code.
Inspect invalid-format responses and errors instead of silently discarding them.

For the adapted review methods, use `--policy=methods --variant=both`. This
retains inspection v2 in both variants and removes only REVIEW_METHODS_POLICY
from the baseline. No upstream plugin or publication tools are invoked.
