import { NextRequest, NextResponse } from "next/server";
import { bearer, verifyIdentity } from "@/lib/agentic-sdlc/agentic-sdlc-auth";
export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname.replace(/^\/apps\/agentic-sdlc/, "");
  if (
    path === "/healthz" ||
    path === "/health/ready" ||
    path === "/health/live" ||
    path.startsWith("/_next/") ||
    path === "/api/agentic-sdlc/webhooks/github"
  )
    return NextResponse.next();
  try {
    await verifyIdentity(bearer(req));
    return NextResponse.next();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}
