import type { AgentEvent, StartRequest } from "@/lib/types/stagehand";

/** Posts a job to /api/agent and calls onEvent for each server-sent event. */
export async function streamAgent(
  request: StartRequest,
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(request),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = `The request failed (${res.status}).`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // Body was not JSON; keep the generic message.
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          onEvent(JSON.parse(line.slice(6)) as AgentEvent);
        } catch {
          // Ignore malformed frames rather than failing the whole run.
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}

/** Names of tools that call the Qloo API (used to label trace rows). */
export const QLOO_TOOL_NAMES = new Set([
  "resolve_city",
  "search_entities",
  "find_local_places",
  "get_insights",
  "compare_audiences",
  "get_location_insights",
]);
