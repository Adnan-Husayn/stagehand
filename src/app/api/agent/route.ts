import { NextRequest } from "next/server";
import { runStagehand } from "@/lib/agent/run";
import { parseStartRequest } from "@/lib/agent/validate-request";
import { QlooError } from "@/lib/qloo/client";
import type { AgentEvent } from "@/lib/types/stagehand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Live runs make several sequential model and Qloo calls. 300s is the Hobby plan ceiling.
export const maxDuration = 300;

function userFacingError(err: unknown): string {
  if (err instanceof QlooError) return err.message;
  if (err instanceof Error && err.message) {
    // Anthropic SDK errors carry status codes; keep messages short and free of request details.
    return err.message.length > 300 ? `${err.message.slice(0, 297)}...` : err.message;
  }
  return "Something went wrong while running the agent. Check the server logs.";
}

/**
 * POST /api/agent
 * Body: StartRequest (see src/lib/types/stagehand.ts).
 * Response: text/event-stream of AgentEvent JSON objects, ending with a "done" event.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const parsed = parseStartRequest(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // The client has disconnected. Keep running quietly so the job finishes cleanly.
        }
      };
      try {
        await runStagehand(parsed.value, send);
      } catch (err) {
        if (!(err instanceof QlooError)) console.error("[stagehand] run failed:", err);
        send({ type: "error", message: userFacingError(err) });
      } finally {
        send({ type: "done" });
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
