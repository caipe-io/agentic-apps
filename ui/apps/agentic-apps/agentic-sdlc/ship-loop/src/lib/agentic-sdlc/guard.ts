import { getServerConfig } from "@/lib/config";
import {
  canReadRepository,
  requireAgenticSdlcReader,
} from "./agentic-sdlc-auth";
// Next supplies route-specific parameter shapes to this shared wrapper.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AgenticSdlcRouteHandler = (
  req: any,
  ctx?: any,
) => Promise<Response> | Response;
export function withAgenticSdlcGate(
  handler: AgenticSdlcRouteHandler,
): AgenticSdlcRouteHandler {
  return async (req, ctx) => {
    if (!getServerConfig().shipLoopEnabled)
      return new Response(null, { status: 404 });
    if (!(await requireAgenticSdlcReader(req)))
      return Response.json({ error: "unauthorized" }, { status: 401 });
    try {
      const params = ctx?.params ? await ctx.params : {};
      if (
        params.owner &&
        params.repo &&
        !(await canReadRepository(req, params.owner, params.repo))
      )
        return new Response(null, { status: 404 });
      const response = await handler(req, ctx);
      if (
        !response.headers.get("content-type")?.includes("text/event-stream") ||
        !response.body
      )
        return response;
      const reader = response.body.getReader();
      let timer: ReturnType<typeof setTimeout>;
      return new Response(
        new ReadableStream({
          start(controller) {
            let closed = false;
            const end = () => {
              if (closed) return;
              closed = true;
              clearTimeout(timer);
              void reader.cancel();
              try {
                controller.close();
              } catch {}
            };
            timer = setTimeout(end, 55000);
            void (async () => {
              try {
                for (;;) {
                  const { done, value } = await reader.read();
                  if (done || closed) break;
                  controller.enqueue(value);
                }
              } catch {
              } finally {
                end();
              }
            })();
          },
          cancel() {
            clearTimeout(timer);
            void reader.cancel();
          },
        }),
        { headers: response.headers, status: response.status },
      );
    } catch {
      return Response.json(
        {
          error: "source_unavailable",
          message:
            "Connect GitHub and retry; the repository or data source could not be read.",
        },
        { status: 503 },
      );
    }
  };
}
export function isAgenticSdlcServerEnabled() {
  return getServerConfig().shipLoopEnabled;
}
