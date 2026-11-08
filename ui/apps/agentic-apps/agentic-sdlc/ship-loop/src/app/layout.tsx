import { RuntimeBridge } from "@/components/agentic-sdlc/RuntimeBridge";
import type { ReactNode } from "react";
import "./globals.css";
import { isPrWorkspace } from "@/lib/agentic-sdlc/view-mode";
export const metadata = { title: "Agentic SDLC" };
export const dynamic = "force-dynamic";
export default function Layout({ children }: { children: ReactNode }) {
  const buildVersion = process.env.APP_BUILD_VERSION;
  const buildRevision = process.env.APP_BUILD_REVISION;
  const version =
    buildVersion &&
    buildVersion !== "unknown" &&
    /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,127}$/.test(buildVersion)
      ? buildVersion
      : null;
  const revision =
    buildRevision && /^[a-f0-9]{7,64}$/i.test(buildRevision)
      ? buildRevision.slice(0, 12)
      : null;
  const build =
    version && revision && version === buildRevision
      ? revision
      : version && revision
        ? `${version} · ${revision}`
        : version || revision || "unavailable";
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script src="/apps/agentic-sdlc/theme.js" />
      </head>
      <body>
        <div className="agentic-sdlc-app min-h-screen">
          <div className="sticky top-0 z-40 flex justify-end border-b border-border/50 bg-background/95 px-6 py-2 text-xs text-muted-foreground backdrop-blur">
            <span
              aria-label="Application build version"
              title={
                revision
                  ? `Commit ${buildRevision}`
                  : "Build revision unavailable"
              }
              className="inline-flex flex-wrap items-center justify-end gap-x-2"
            >
              <span>Agentic SDLC</span>
              <span className="rounded-md border border-border bg-secondary/50 px-2 py-0.5 font-mono text-foreground">
                Version {build}
              </span>
            </span>
          </div>
          {children}
          <RuntimeBridge prOnly={isPrWorkspace()} />
        </div>
      </body>
    </html>
  );
}
