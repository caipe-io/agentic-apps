import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
export type AgenticSdlcReader = {
  kind: "session";
  user: { id: string; email: string; name: string };
};
export type AgenticSdlcReaderSession = AgenticSdlcReader;
export type AgenticSdlcReaderMock = never;
export function isAgenticSdlcMockAuthAllowed() {
  return false;
}

export async function verifyIdentity(token: string): Promise<JWTPayload> {
  const issuer = process.env.AGENTIC_SDLC_OIDC_ISSUER;
  const audiences = process.env.AGENTIC_SDLC_OIDC_AUDIENCES?.split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (!issuer || !audiences?.length)
    throw new Error("Agentic SDLC identity is not configured");
  jwks ??= createRemoteJWKSet(
    new URL(
      process.env.AGENTIC_SDLC_OIDC_JWKS_URL ||
        issuer.replace(/\/$/, "") + "/protocol/openid-connect/certs",
    ),
  );
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience: audiences,
    algorithms: ["RS256"],
  });
  if (!payload.sub || payload.azp === "anonymous")
    throw new Error("A stable user subject is required");
  return payload;
}
export function bearer(req: Request) {
  return req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1] || "";
}
export async function requireAgenticSdlcReader(
  req: Request,
): Promise<AgenticSdlcReader | null> {
  try {
    const p = await verifyIdentity(bearer(req));
    // Legacy storage fields named user_email contain the stable subject, not a mutable email claim.
    return {
      kind: "session",
      user: {
        id: p.sub!,
        email: p.sub!,
        name: typeof p.name === "string" ? p.name : "Signed-in user",
      },
    };
  } catch {
    return null;
  }
}
const tokenRequests = new WeakMap<Request, Promise<string>>();
export function getGitHubAccessToken(req: Request): Promise<string> {
  let pending = tokenRequests.get(req);
  if (!pending) {
    pending = exchangeGitHubToken(req);
    tokenRequests.set(req, pending);
  }
  return pending;
}
async function exchangeGitHubToken(req: Request): Promise<string> {
  const origin = process.env.AGENTIC_SDLC_CAIPE_API_ORIGIN;
  if (!origin || !(await requireAgenticSdlcReader(req)))
    throw new Error("Connected GitHub access is unavailable");
  const response = await fetch(new URL("/api/credentials/exchange", origin), {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      authorization: "Bearer " + bearer(req),
      "content-type": "application/json",
      "x-caipe-credential-caller": "internal_service",
      "x-caipe-credential-audience": "caipe-credential-service",
    },
    body: JSON.stringify({ provider: "github" }),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error("Connect GitHub in CAIPE to inspect this repository");
  const payload = await response.json();
  const token = payload.data?.access_token;
  if (typeof token !== "string" || !token)
    throw new Error("Connected GitHub credentials are unavailable");
  return token;
}
export async function canReadRepository(
  req: Request,
  owner: string,
  repo: string,
): Promise<boolean> {
  const token = await getGitHubAccessToken(req);
  const base =
    process.env.AGENTIC_SDLC_GITHUB_API_URL || "https://api.github.com";
  const response = await fetch(
    `${base}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    {
      headers: {
        authorization: "Bearer " + token,
        accept: "application/vnd.github+json",
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    },
  );
  return response.ok;
}

export async function authorizedRepoIds(req: Request): Promise<string[]> {
  const { getAgenticSdlcReposCollection } = await import("./mongo-collections");
  const repos = await getAgenticSdlcReposCollection();
  const rows = await repos
    .find(
      { offboarded_at: null },
      { projection: { repo_id: 1, owner: 1, name: 1 }, limit: 100 },
    )
    .toArray();
  const result: string[] = [];
  // Bound upstream concurrency and never expose repo metadata before checking access.
  for (let i = 0; i < rows.length; i += 5) {
    const batch = await Promise.all(
      rows
        .slice(i, i + 5)
        .map(async (r) =>
          (await canReadRepository(req, r.owner, r.name)) ? r.repo_id : null,
        ),
    );
    result.push(...batch.filter((v): v is string => v !== null));
  }
  return result;
}
