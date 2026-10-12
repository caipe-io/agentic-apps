# Weather Lab native-package example

This small React package is an **opt-in** native UI for the existing Weather
Lab runtime. It publishes `AgenticAppManifest` **2.0**, while its React component
ABI remains **1.1**, without adding or changing a backend service. The same
manifest declares `native` and `hosted` UI profiles. The installation selects
one profile; `/apps/weather` redirects to `/weather` when native is selected,
and embeds the existing runtime when hosted is selected. It does not expose
both renderers simultaneously through the same installed app ID.

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
node /path/to/caipe/ui/native-extension-sdk/bin/check-manifest.mjs ui/apps/agentic-apps/weather/native-package/manifest.json
artifact_directory=$(mktemp -d)
npm pack ./ui/apps/agentic-apps/weather/native-package --pack-destination "$artifact_directory"
mkdir "$artifact_directory/unpacked"
tar -xzf "$artifact_directory/caipe-weather-native-0.2.0.tgz" -C "$artifact_directory/unpacked" --strip-components=1
node /path/to/caipe/ui/scripts/check-native-extension.mjs "$artifact_directory/unpacked"
```

Install the exact tarball or published version in a **derived** CAIPE UI
image, keep its lockfile integrity entry, and set
`CAIPE_NATIVE_EXTENSION_MODULES=@caipe/weather-native` at build time. The
host contract cannot fetch this JavaScript dynamically. The complete publisher
manifest now contains the existing role, scope, and HTTP policies.
Use `installation.example.yaml` for deployment-owned configuration and bind
its private runtime origin. Remove the legacy Weather entry from
`agentic_apps.packages`: a compiled 2.0 manifest cannot be repeated or
overridden in runtime configuration. Set `selected_ui_profile` explicitly
to `native` or `hosted`. The package version must match `app_version`.

CI validates the package against pinned Phase 1 CAIPE commit
`8c1e27b9de78ee5df49b1acaa0eb984303d50f7a` (PR #2852, not yet merged).
MCP/agent declarations reference existing registries; they do not install
those resources or grant access. `requestedPermissions` is empty.
Native-only host capability references are optional in this multi-profile
manifest so selecting hosted does not claim support for the native host SDK.

This is intentionally a smaller dashboard than the iframe application. Its
agent chat, preference controls, and iframe assistant popup are not migrated.
Native packages share the host document and must be reviewed as trusted code.
The standalone iframe runtime's existing `manifest.mjs` and
`deploy/caipe/agentic-app.json` remain compatible with the older runtime
registration mechanism. `apps.manifest.json` remains the container build
catalog, not an `AgenticAppManifest`.
