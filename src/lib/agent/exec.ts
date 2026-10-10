import type { RunContext } from "./context";
import type { AgentTool, Emit, ToolOutcome } from "./types";
import type { TraceStep } from "../types/stagehand";

export const QLOO_TOOLS = new Set([
  "resolve_city",
  "search_entities",
  "find_local_places",
  "get_insights",
  "compare_audiences",
  "get_location_insights",
]);

export function makeStep(kind: TraceStep["kind"], detail: string, extra: Partial<TraceStep> = {}): TraceStep {
  return { id: crypto.randomUUID(), kind, detail, at: new Date().toISOString(), ...extra };
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export function summarizeInput(input: unknown): string {
  if (typeof input !== "object" || input === null) return "";
  return Object.entries(input as Record<string, unknown>)
    .map(([key, value]) => {
      let text: string;
      if (Array.isArray(value)) text = `[${value.length} item${value.length === 1 ? "" : "s"}]`;
      else if (typeof value === "object" && value !== null) text = "{...}";
      else text = String(value);
      return `${key}=${truncate(text, 60)}`;
    })
    .join(", ");
}

/** Runs one tool, emitting trace events before and after. Errors become tool results, not crashes. */
export async function executeTool(
  tool: AgentTool,
  input: unknown,
  ctx: RunContext,
  emit: Emit,
): Promise<ToolOutcome> {
  emit({
    type: "trace",
    step: makeStep("tool_call", `${tool.name}(${summarizeInput(input)})`, {
      tool: tool.name,
    }),
  });
  const started = Date.now();
  let outcome: ToolOutcome;
  try {
    outcome = await tool.run(input, ctx);
  } catch (err) {
    outcome = { ok: false, error: err instanceof Error ? err.message : "Unknown tool error." };
  }
  emit({
    type: "trace",
    step: makeStep("tool_result", outcome.ok ? outcome.summary : `Error: ${outcome.error}`, {
      tool: tool.name,
      durationMs: Date.now() - started,
    }),
  });
  return outcome;
}
