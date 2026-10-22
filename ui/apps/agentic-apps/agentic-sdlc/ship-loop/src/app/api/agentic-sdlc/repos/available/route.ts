import { Octokit } from "@octokit/rest";
import {
  getGitHubAccessToken,
  requireAgenticSdlcReader,
} from "@/lib/agentic-sdlc/agentic-sdlc-auth";
import { withAgenticSdlcGate } from "@/lib/agentic-sdlc/guard";
async function handle(req: Request) {
  if (!(await requireAgenticSdlcReader(req)))
    return Response.json({ message: "Sign in required." }, { status: 401 });
  try {
    const url = new URL(req.url),
      page = Math.min(
        100,
        Math.max(1, Number(url.searchParams.get("page")) || 1),
      );
    const query = (url.searchParams.get("q") || "").trim();
    const client = new Octokit({
      auth: await getGitHubAccessToken(req),
      baseUrl: process.env.AGENTIC_SDLC_GITHUB_API_URL,
      request: { timeout: 15000 },
    });
    if (query.includes("/")) {
      const parts = query.split("/");
      if (
        parts.length !== 2 ||
        !/^[a-zA-Z0-9-]+$/.test(parts[0]) ||
        !/^[a-zA-Z0-9_.-]+$/.test(parts[1]) ||
        [".", ".."].includes(parts[1])
      )
        return Response.json({ message: "Enter owner/repo." }, { status: 400 });
      const { data: repo } = await client.repos.get({
        owner: parts[0],
        repo: parts[1],
      });
      return Response.json({
        items: [
          {
            full_name: repo.full_name,
            admin: Boolean(repo.permissions?.admin),
          },
        ],
        next_page: null,
      });
    }
    const { data } = await client.repos.listForAuthenticatedUser({
      sort: "updated",
      direction: "desc",
      per_page: 50,
      page,
    });
    return Response.json({
      items: data
        .filter(
          (repo) =>
            repo.permissions?.admin &&
            repo.full_name.toLowerCase().includes(query.toLowerCase()),
        )
        .map((repo) => ({ full_name: repo.full_name, admin: true })),
      next_page: data.length === 50 ? page + 1 : null,
      note: "Recent repositories you administer. Enter owner/repo to look up another repository.",
    });
  } catch {
    return Response.json(
      {
        message:
          "Connect GitHub in Grid Credentials, authorize organization SSO if needed, then retry repository selection.",
      },
      { status: 403 },
    );
  }
}
export const GET = withAgenticSdlcGate(handle);
