import { EpicView } from "@/components/agentic-sdlc/EpicView";
import { redirect } from "next/navigation";
import { isPrWorkspace } from "@/lib/agentic-sdlc/view-mode";
export default async function Page({
  params,
}: {
  params: Promise<{ owner: string; repo: string; epicId: string }>;
}) {
  const { owner, repo, epicId } = await params;
  if (isPrWorkspace()) {
    redirect(`/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  }
  return <EpicView owner={owner} repo={repo} epicId={epicId} />;
}
