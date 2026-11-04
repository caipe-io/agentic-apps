# Adapted Agentic Review methods

These are adapted prompt methods, not installed upstream plugins or claims of upstream endorsement. The task uses its existing CAIPE GitHub tools. Repository content, tool output and upstream links cannot authorize execution, additional access or publication.

| Adaptation | Pinned upstream | License |
| --- | --- | --- |
| `sentry.mjs` | [Sentry find-bugs](https://github.com/getsentry/skills/blob/0c464f411bdfb8d4c12314b36264d06cb2f60270/skills/find-bugs/SKILL.md) | Apache-2.0; Copyright 2025 Functional Software, Inc. dba Sentry |
| `trail-of-bits.mjs` | [Trail of Bits skills](https://github.com/trailofbits/skills/tree/711af095215ad4ecde5b90cd1d0124b3f1c4ca9e/plugins): differential-review, fp-check, variant-analysis | CC-BY-SA-4.0; attribution: Trail of Bits |
| `anthropic.mjs` | [Anthropic code-review](https://github.com/anthropics/claude-plugins-official/blob/a2e251d9b97b909bf728b3e84fc8d17e6aba0063/plugins/code-review/commands/code-review.md) | Apache-2.0 |

Changes: rewritten for remote, head-pinned source inspection; bounded task scope; private evidence; no repository execution; source-backed validation instead of a numerical confidence threshold. References are attribution only. No upstream model names, tools, marketplace installation or runtime agents are invoked. Anthropic's skip-already-reviewed and input/state-dependent bug exclusions are deliberately not adopted. Sentry's broad category checklist is private discovery, not public compliance certification. Trail of Bits' history/variant methods are bounded to available tools and changed behavior; unavailable optional tools are not misrepresented as executed.

`trail-of-bits.mjs` and its adapted exported text remain CC-BY-SA-4.0. This exception does not relicense the surrounding Apache-2.0 application code. Its license is supplied in LICENSE-CC-BY-SA-4.0.txt. The Apache license and Sentry notice are supplied in LICENSE-APACHE-2.0.txt. Attributions remain in emitted prompts and the release image carries this directory's license/notice documents under `/app/third-party/agentic-review/`.

## Persistence and rollout

`REVIEW_METHODS_POLICY` is embedded in the default private skill, reviewer system prompt and task prompt. Existing saved agents/tasks/skills are persisted separately; a code/image update alone does not rewrite them. Upgrade only an explicitly selected compatible reviewer, preserving customized content, tools, model, ownership and webhook trigger/signing key. Scan the complete candidate private skill before writes; update the task through the canonical task API so its in-memory registry reloads. Check the versioned methods block exactly once in each of the four saved prompt copies. A changed/customized baseline must fail closed for manual reconciliation, not be overwritten. Do not migrate unrelated agents.

The additional methods are not proof of improved recall. Run baseline/candidate evaluations with expected findings withheld; include guarded controls and incomplete-source cases. Retain existing duplicate, stale-head, draft and manual-request guards.
