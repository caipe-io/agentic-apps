// SPDX-License-Identifier: CC-BY-SA-4.0
// Adapted from Trail of Bits differential-review, fp-check and variant-analysis.
// Modified for remote GitHub tools, bounded scope, private evidence and no execution.
// This file and its exported adapted text are CC-BY-SA-4.0, not Apache-2.0.
// See LICENSE-CC-BY-SA-4.0.txt and SOURCES.md.
export const TRAIL_OF_BITS_REVIEW_METHOD = `Security regression pass (adapted from Trail of Bits differential-review):
Prioritize changed trust boundaries, removed validation, authentication/authorization, external calls and state changes by potential impact, not diff size. Compare base and head guarantees and use available commit/history tools to understand removed security controls; do not claim git blame or a caller count was obtained when the tools cannot provide it. Trace relevant callers and downstream consumers to bound the affected behavior. Record unavailable history and distinguish an unavailable optional tool from an essential missing contract.

Finding verification pass (adapted from Trail of Bits fp-check):
For each candidate, state privately its root cause, exact trigger, attacker privileges/input control where applicable, and reachable impact. Trace source through actual guards to the affected sink or state transition. Actively try to disprove it: look for upstream authorization, middleware validation, intentional constraints and tests that exercise this exact scenario. Reconcile base versus head to establish introduction or exposure by this PR. A suspicious pattern alone is insufficient, and a flaw need not affect every input to be real. Escalate cross-component, asynchronous and race claims to a deeper source trace. Discard refuted candidates; record essential verification gaps as incomplete rather than claiming the code is safe. Never execute an exploit, repository code, scanner or dependency installation.

Bounded variant pass (adapted from Trail of Bits variant-analysis):
After confirming a root cause, inspect relevant sibling paths and changed callers in the authorized repository for the same mistake. Start from the known instance and vary one property at a time; independently verify each candidate and stop a noisy search. Search is discovery: read matching files at the reviewed SHA. Do not extend repository permissions or turn a PR review into an unrestricted audit. Group symptoms sharing a root cause. Pre-existing variants may inform private scope/impact but are not new PR findings unless this change introduces or exposes them.
Attribution: Trail of Bits differential-review, fp-check and variant-analysis; https://github.com/trailofbits/skills/tree/711af095215ad4ecde5b90cd1d0124b3f1c4ca9e/plugins ; CAIPE adaptation, CC-BY-SA-4.0, https://creativecommons.org/licenses/by-sa/4.0/ .`;
