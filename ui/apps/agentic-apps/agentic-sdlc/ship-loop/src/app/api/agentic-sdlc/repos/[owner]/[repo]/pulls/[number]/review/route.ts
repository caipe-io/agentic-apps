import { withAgenticSdlcGate } from "@/lib/agentic-sdlc/guard";

// Older cached clients must reload; app bearer credentials cannot carry
// browser-session administrator privileges to bot-owned tasks.
const reload = () =>
  Response.json(
    { message: "Reload Agentic SDLC to use Re-review with your Grid session." },
    { status: 409 },
  );
export const POST = withAgenticSdlcGate(reload);
export const GET = withAgenticSdlcGate(reload);
