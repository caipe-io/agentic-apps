import { RuntimeBridge } from "@/components/agentic-sdlc/RuntimeBridge";
import type { ReactNode } from "react";
import "./globals.css";
export const metadata = { title: "Agentic SDLC" };
export const dynamic = "force-dynamic";
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <div className="agentic-sdlc-app min-h-screen">
          {children}
          <RuntimeBridge />
        </div>
      </body>
    </html>
  );
}
