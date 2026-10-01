# Weather Lab native-package example

This small React package is an **opt-in** native UI for the existing Weather
Lab runtime. It demonstrates CAIPE native contract `1.1` without adding or
changing a backend service. The existing `/apps/weather` iframe remains
available for side-by-side comparison.

The package owns `/weather` and `/weather/:city`, contributes a navigation
item and breadcrumbs, and calls the existing
`POST /api/copilotkit/weather-agent` endpoint. CAIPE rewrites that path to its
authenticated app gateway, mints an app-scoped JWT, and forwards the request
to the separate Weather runtime. The runtime verifies the token and the
`weather:agent` scope. The React component receives no token.

## Verify

```bash
npm ci
npm run check
npm test
npm run smoke
node /path/to/caipe/ui/scripts/check-native-extension.mjs ui/apps/agentic-apps/weather/native-package
npm pack ./ui/apps/agentic-apps/weather/native-package
```

Install the exact tarball or published version in a **derived** CAIPE UI
image, keep its lockfile integrity entry, and set
`CAIPE_NATIVE_EXTENSION_MODULES=@caipe/weather-native` at build time. The
host contract cannot fetch this JavaScript dynamically. The deployment must
already have the Weather External App installed and enabled with
`app-scoped-token` authentication and a POST policy permitting
`/api/copilotkit/weather-agent`; the regular Weather manifest provides these.

This is intentionally a smaller dashboard than the iframe application. Its
agent chat, preference controls, and iframe assistant popup are not migrated.
Native packages share the host document and must be reviewed as trusted code.
