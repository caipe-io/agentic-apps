// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Functional Software, Inc. dba Sentry
// Adapted from getsentry/skills find-bugs; modified for CAIPE's read-only tools,
// scoped evidence and private coverage notes. See SOURCES.md.
export const SENTRY_REVIEW_METHOD = `Discovery pass (adapted from Sentry find-bugs):
Privately inventory every changed file and read every changed line, paging or fetching exact head files when a diff is truncated. Map changed inputs (body, headers, URL, events), storage queries, permission checks, session/state changes, external calls and cryptographic operations. For each applicable boundary, inspect injection/output encoding, authentication versus object authorization, CSRF, read/write races, session handling, secret/error exposure, resource exhaustion and business-state transitions. A checklist item is a question to investigate, not a finding or a requirement to certify every category. Use surrounding implementations and tests to check the claim; merely having tests does not prove the scenario is covered. Keep a compact private coverage ledger of inspected paths, applicable risks, evidence and unresolved gaps. Do not publish checklist tables or invent defects.
Attribution: Sentry find-bugs, Apache-2.0; https://github.com/getsentry/skills/blob/0c464f411bdfb8d4c12314b36264d06cb2f60270/skills/find-bugs/SKILL.md (CAIPE adaptation).`;
