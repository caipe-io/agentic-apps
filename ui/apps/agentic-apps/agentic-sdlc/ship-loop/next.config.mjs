export default {
  output: "standalone",
  outputFileTracingRoot: import.meta.dirname,
  experimental: { cpus: 2 },
  basePath: "/apps/agentic-sdlc",
  // The host preserves the app mount and proxies its root with a trailing slash.
  // Redirecting that root back to the canonical mount would reload the shell.
  skipTrailingSlashRedirect: true,
  poweredByHeader: false,
};
