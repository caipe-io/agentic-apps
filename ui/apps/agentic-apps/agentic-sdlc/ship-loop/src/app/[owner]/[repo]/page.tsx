import { RepoDetailShell } from "@/components/agentic-sdlc/RepoDetailShell";
export default async function Page({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  return <RepoDetailShell owner={owner} repo={repo} />;
}
