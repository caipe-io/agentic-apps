export async function GET() {
  return Response.json({ ok: true, app: "agentic-sdlc", runtime: "ship-loop" });
}
