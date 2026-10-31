import { RuntimeBridge } from "@/components/agentic-sdlc/RuntimeBridge";
import type { ReactNode } from "react";
import "./globals.css";
import { isPrWorkspace } from "@/lib/agentic-sdlc/view-mode";
export const metadata = { title: "Agentic SDLC" };
export const dynamic = "force-dynamic";
export default function Layout({ children }: { children: ReactNode }) {
  const buildVersion = process.env.APP_BUILD_VERSION;
  const buildRevision = process.env.APP_BUILD_REVISION;
  const version = buildVersion && buildVersion !== "unknown" && /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,127}$/.test(buildVersion) ? buildVersion : null;
  const revision = buildRevision && /^[a-f0-9]{7,64}$/i.test(buildRevision) ? buildRevision.slice(0, 12) : null;
  const build = version && revision && version === buildRevision ? revision : version && revision ? `${version} · ${revision}` : version || revision || "unavailable";
  return (
    <html lang="en" className="dark">
      <body>
        <div className="agentic-sdlc-app min-h-screen">
          {children}
          <div aria-label="Application build version" title={revision ? buildRevision : "Build revision unavailable"} style={{ padding: "10px 24px", textAlign: "right", color: "#94a3b8", fontSize: "12px" }}>Build {build}</div>
          <RuntimeBridge prOnly={isPrWorkspace()} />
        </div>
      </body>
    </html>
  );
}
