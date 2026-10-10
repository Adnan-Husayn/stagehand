import type { RunContext } from "./context";

export type ToolOutcome =
  | { ok: true; content: unknown; summary: string }
  | { ok: false; error: string };

export interface AgentTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
  run: (input: unknown, ctx: RunContext) => Promise<ToolOutcome>;
}

export type Emit = (event: import("../types/stagehand").AgentEvent) => void;
