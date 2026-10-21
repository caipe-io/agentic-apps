import { getCollection } from "@/lib/mongodb";
import { AGENTIC_SDLC_COLLECTIONS } from "@/types/agentic-sdlc";
export const dynamic = "force-dynamic";
export async function GET() {
  const required = [
    "AGENTIC_SDLC_MONGODB_URI",
    "AGENTIC_SDLC_OIDC_ISSUER",
    "AGENTIC_SDLC_OIDC_AUDIENCES",
    "AGENTIC_SDLC_CAIPE_API_ORIGIN",
  ];
  if (required.some((k) => !process.env[k]))
    return Response.json(
      { ok: false, reason: "configuration_missing" },
      { status: 503 },
    );
  try {
    await (
      await getCollection(AGENTIC_SDLC_COLLECTIONS.REPOS)
    ).estimatedDocumentCount({ maxTimeMS: 2000 });
    return Response.json({ ok: true, app: "agentic-sdlc" });
  } catch {
    return Response.json(
      { ok: false, reason: "storage_unavailable" },
      { status: 503 },
    );
  }
}
