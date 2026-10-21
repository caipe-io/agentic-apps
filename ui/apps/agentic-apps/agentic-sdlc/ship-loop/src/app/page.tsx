import { AgenticSdlcHome } from "@/components/agentic-sdlc/AgenticSdlcHome";
import { PrWorkspaceHome } from "@/components/agentic-sdlc/PrWorkspace";
import { isPrWorkspace } from "@/lib/agentic-sdlc/view-mode";
export default function Page() {
  return isPrWorkspace() ? <PrWorkspaceHome /> : <AgenticSdlcHome />;
}
