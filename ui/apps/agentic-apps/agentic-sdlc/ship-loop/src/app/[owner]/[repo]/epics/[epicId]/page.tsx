import { EpicView } from "@/components/agentic-sdlc/EpicView";
export default async function Page({
  params,
}: {
  params: Promise<{ owner: string; repo: string; epicId: string }>;
}) {
  const { owner, repo, epicId } = await params;
  return <EpicView owner={owner} repo={repo} epicId={epicId} />;
}
