# Presentation Generator acceptance

These app-owned cases retain the MCP-06 IDs from the original host proposal.
Host gateway, canonical team membership and live agent acceptance run at the
configured deployment; local fixture tests do not establish those outcomes.

| Case | Expected behavior | Automated adapters |
| --- | --- | --- |
| MCP-06.01 | Caller-private searchable/sortable history; host appearance; admin-only owner picker; bounded exact-ranked owner/share search; removable sharing chips; owner exclusion; automatic configured upload mapping; No redundant sidebar or empty-history chat links; creation uses the configured host assistant and its History/New chat controls on stable hosts | `test/{ui,picker,http}.test.mjs`; browser acceptance on configured host |
| MCP-06.02 | Authorized upload → tool discovery → plan → approved editable render → protected download; stable app ID, three tool names, immutable template version, original theme/master and full notes; missing metric values identify their field before execution; geometry errors give slide-specific repair guidance; qualitative repair preserves mode/density/count and notes | `test/{http,planning,renderer,template.integration,manifest}.test.mjs` |
| MCP-06.03 | Wrong/expired JWTs, non-admin uploads, outside-team templates, other-user downloads, revoked memberships, stale versions and unsafe packages fail closed | `test/{auth,http,mongo,renderer}.test.mjs` |
| MCP-06.04 | Seven-day expiry; creator-only Keep removes TTL, Resume starts seven days without retry extension, Delete removes bytes; expired records cannot be revived | `test/{http,mongo}.test.mjs`; browser confirmation/cancel on configured host |
| MCP-06.05 | Six native editable visual layouts preserve sources and notes; flags appear only in notes, with no generated Verify badges/prefixes; density, value and geometry validation precedes approval | `test/{visuals,http}.test.mjs`; `test/generate-schema-fixtures.mjs` plus Microsoft Open XML SDK |
| MCP-06.06 | Repository/image migration preserves app manifest, route, native tool IDs, template/artifact collection names and existing records; old authorized downloads remain available | `test/{manifest,http,mongo}.test.mjs`; image rollout, signed-in history/download and native MCP check at configured host |

CI enables real loopback MongoDB and canonical host SDK policy checks. Private
external-template tests, font/layout inspection, native PowerPoint opening and
live signed-in gateway/agent checks are separate deployment acceptance.
