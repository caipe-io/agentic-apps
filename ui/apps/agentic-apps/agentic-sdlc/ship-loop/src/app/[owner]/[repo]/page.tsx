import { RepoDetailShell } from "@/components/agentic-sdlc/RepoDetailShell";
import { PrRepoWorkspace } from "@/components/agentic-sdlc/PrWorkspace";
import { isPrWorkspace } from "@/lib/agentic-sdlc/view-mode";
export default async function Page({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  return isPrWorkspace() ? (
    <PrRepoWorkspace owner={owner} repo={repo} />
  ) : (
    <RepoDetailShell owner={owner} repo={repo} />
  );
}
