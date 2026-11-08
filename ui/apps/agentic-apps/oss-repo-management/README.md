# OSS Report Card

## Adoption and usage

- Live GitHub snapshot: stars, forks, contributor identities, open issue/PR queues.
- Authenticated GitHub Search: all-time PRs opened/merged and monthly PRs opened for up to 18 calendar months, starting at repository creation when newer.
- Counts are batched in one GraphQL request, avoiding a REST Search request for each month.
- Current UTC month is partial. Search indexing may lag. Failed or incomplete counts display as unavailable, never zero.
- Contributor identities include bots and anonymous accounts; the current 100-identity sample is labeled as a lower bound when full.
- Historical package downloads are supplied by deployment configuration. They are dated reported counts, not live registry reads, unique users, or installations.
- Dashboard, MCP responses and Markdown exports use the same snapshot. Existing runtime caching applies (15 minutes by default).

## Historical snapshot configuration

Set `OSS_REPO_MANAGEMENT_ADOPTION_SNAPSHOTS_FILE` to a mounted JSON file. The latest snapshot matching the canonical GitHub repository is used. No repository-specific metrics are built into the image.

```json
[
  {
    "repo": "example/project",
    "asOf": "2026-07-31",
    "source": "Monthly adoption report",
    "metrics": {
      "stars": 100,
      "forks": 20,
      "contributorIdentities": 15,
      "pullRequestsOpened": 200,
      "pullRequestsMerged": 180,
      "packageDownloads": 1250,
      "legacyPackageDownloads": 250,
      "currentPackageDownloads": 1000
    },
    "caveats": [
      "Package figures are rounded; legacy attribution is estimated.",
      "Includes automated and repeated pulls.",
      "Contributor identities include bots and anonymous accounts."
    ]
  }
]
```

- Counts must be nonnegative integers. When all three download figures are present, the total must equal legacy plus current.
- The file must contain a source, valid date and caveats; invalid configuration fails at startup.
- Without a matching snapshot, package downloads display as unavailable.
- Historical counts and caveats are shown separately from the live GitHub snapshot and included in exports.

## Validation

```bash
npm run check
node --test ui/apps/agentic-apps/oss-repo-management/*.test.mjs
npm run smoke
```

## Report URLs

- `?repo=example/project` opens the current report using the server cache when available.
- `?repo=example/project&report=latest` opens the newest saved snapshot in this browser.
- `?repo=example/project&report=<snapshot-id>` opens that exact saved snapshot; selecting or generating a report updates the address bar.
- `staleDays=60` preserves the stale-issue threshold (1–365; default 30).
- Back/Forward restores report selection. Existing assistant parameters and section anchors survive report changes.
- Saved snapshots are browser-local and limited to 20 reports. An unavailable snapshot displays a message without substituting fresh data. These URLs identify snapshots; they do not grant repository access or transfer the report to another browser.


### Report sections

The report uses accessible tab panels, without anchor scrolling inside the Grid iframe.
`tab=priorities`, `tab=activity`, and `tab=community` restore the selected section;
no `tab` parameter opens Overview. The repository, exact saved report and other URL state
remain intact across tab changes and Back/Forward. Legacy report-section fragments
are migrated to the corresponding tab query without scrolling the host layout.
