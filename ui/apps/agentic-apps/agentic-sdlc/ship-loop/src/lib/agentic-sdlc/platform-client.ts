import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { bearer, requireAgenticSdlcReader } from "./agentic-sdlc-auth";

export class SetupError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

// The host, not this app, authenticates the original caller and enforces
// Autonomous entitlement, team ownership, agent/tool permissions and task ownership.
export async function platformRequest(
  req: Request,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<any> {
  if (!(await requireAgenticSdlcReader(req)))
    throw new SetupError("Sign in to CAIPE first.", 401);
  const origin = process.env.AGENTIC_SDLC_CAIPE_API_ORIGIN;
  if (!origin || !path.startsWith("/api/"))
    throw new SetupError("CAIPE integration is not configured.", 503);
  const url = new URL(path, origin);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new SetupError("Invalid CAIPE service configuration.", 503);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method,
        headers: {
          authorization: `Bearer ${bearer(req)}`,
          accept: "application/json",
          ...(payload === undefined
            ? {}
            : {
                "content-type": "application/json",
                "content-length": String(Buffer.byteLength(payload)),
              }),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > 4 * 1024 * 1024)
            request.destroy(new Error("Response too large"));
          else chunks.push(chunk);
        });
        response.on("end", () => {
          const status = response.statusCode || 502;
          if (status < 200 || status >= 300) {
            reject(
              new SetupError(
                status === 401
                  ? "Sign in and connect GitHub in CAIPE Credentials."
                  : status === 403
                    ? "Your account or team is not permitted to manage this agent or use Autonomous. Ask your CAIPE administrator to enable access."
                    : "CAIPE could not complete review setup. Check the selected team, model and agent permissions, then retry.",
                status >= 400 && status <= 599 ? status : 502,
              ),
            );
            return;
          }
          try {
            resolve(
              chunks.length
                ? JSON.parse(Buffer.concat(chunks).toString())
                : null,
            );
          } catch {
            reject(new SetupError("CAIPE returned an invalid response.", 502));
          }
        });
        response.on("error", () =>
          reject(new SetupError("CAIPE is temporarily unavailable.", 502)),
        );
      },
    );
    const timeout = setTimeout(
      () => request.destroy(new Error("Timeout")),
      90000,
    );
    request.on("close", () => clearTimeout(timeout));
    request.on("error", () =>
      reject(
        new SetupError("CAIPE is temporarily unavailable. Retry setup.", 502),
      ),
    );
    if (payload !== undefined) request.write(payload);
    request.end();
  });
}
export function setupErrorResponse(error: unknown): Response {
  return Response.json(
    {
      message:
        error instanceof SetupError
          ? error.message
          : "Setup could not finish. Retry or contact your CAIPE administrator.",
    },
    { status: error instanceof SetupError ? error.status : 500 },
  );
}
export function managedReviewTask(fullName: string): string | null {
  try {
    const mappings = JSON.parse(
      process.env.AGENTIC_SDLC_MANAGED_REVIEW_TASKS || "{}",
    );
    if (
      !mappings ||
      typeof mappings !== "object" ||
      Array.isArray(mappings) ||
      Object.values(mappings).some(
        (value) => typeof value !== "string" || !/^[a-zA-Z0-9_-]+$/.test(value),
      )
    )
      throw new Error("Invalid mapping");
    const value = mappings[fullName.toLowerCase()];
    return typeof value === "string" && /^[a-zA-Z0-9_-]+$/.test(value)
      ? value
      : null;
  } catch {
    throw new SetupError(
      "Managed review configuration is invalid. Contact your CAIPE administrator.",
      503,
    );
  }
}
export function reviewSetupAvailable() {
  return Boolean(
    process.env.AGENTIC_SDLC_AUTONOMOUS_ORIGIN &&
    process.env.AGENTIC_SDLC_REVIEW_MODEL_ID &&
    process.env.GITHUB_WEBHOOK_SECRET,
  );
}
