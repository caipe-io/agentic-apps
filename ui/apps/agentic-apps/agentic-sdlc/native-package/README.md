# Agentic SDLC native-package example

This package is an **opt-in alternative** to the existing iframe page. It is
React code in the CAIPE UI tree, while the Agentic SDLC HTTP/MCP service and
agent remain separate. The iframe manifest and page are unchanged for current
deployments.

The package declares native contract `1.1`, owns `/sdlc` and its deep links,
adds a left-navigation item, and claims `/api/agentic-sdlc`. Its context call
passes through CAIPE's authenticated gateway to the existing runtime. The
gateway mints an app-scoped token; this service verifies it and requires the
`sdlc:read` scope. The dashboard action calls CAIPE's existing conversation
and agent APIs with the current browser session. No JWT is passed to the
component or stored by the package.

The current iframe assistant-popup messages have no equivalent capability in
native contract `1.1`. This example offers an "Open conversation" link after
invocation; popup parity would require a separately reviewed generic host
capability. It does not claim to migrate existing bookmarks or replace the
current iframe rollout automatically.

## Build and verify

Run from this repository's root after `npm ci`:

```bash
npm run check
npm test
npm run smoke
node /path/to/caipe/ui/scripts/check-native-extension.mjs ui/apps/agentic-apps/agentic-sdlc/native-package
npm pack ./ui/apps/agentic-apps/agentic-sdlc/native-package
```

For an opt-in derived CAIPE image, install the **exact** published package
version or immutable `.tgz`, retain the package-lock integrity entry, set
`CAIPE_NATIVE_EXTENSION_MODULES=@caipe/agentic-sdlc-native` at **build time**,
and build the UI image. The package is not fetched dynamically in the browser.
The host provides React, React DOM, Next.js, NextAuth, and next-themes as peers.

Use [the native catalog example](../deploy/caipe/native-app.yaml.example) as
the app's entry in a deployment-owned catalog. Configure the host and runtime
with the same dedicated `AGENTIC_APP_TOKEN_SECRET`; never use the host session
secret. The native catalog intentionally hides the legacy iframe hub entry
while allowing the compiled native route. The package manifest supplies its
own navigation item. Health and MCP endpoints remain on the existing runtime.

This package is **trusted code** in the CAIPE document, not an iframe security
boundary. Review the source and the exact package artifact before installation.
