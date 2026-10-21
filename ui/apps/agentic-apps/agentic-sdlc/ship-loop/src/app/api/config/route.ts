export async function GET() {
  return Response.json({
    webhook_url: process.env.AGENTIC_SDLC_GITHUB_WEBHOOK_URL || null,
  });
}
