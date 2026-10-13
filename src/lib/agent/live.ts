import type { RunContext } from "./context";
import { executeTool, makeStep, QLOO_TOOLS, truncate } from "./exec";
import { LlmError, type ChatMessage, type LlmClient, type ToolDefinition } from "./llm";
import { QlooError } from "../qloo/client";
import { parseToolArguments } from "./tool-args";
import type { AgentTool, Emit } from "./types";

export interface LiveRunArgs {
  llm: LlmClient;
  system: string;
  userMessage: string;
  tools: AgentTool[];
  ctx: RunContext;
  finalTool: string;
  maxTurns: number;
  emit: Emit;
}

/** Shown when the model stops because every Qloo lookup for the venue came back empty. */
export const NO_QLOO_DATA_MESSAGE =
  "Qloo returned nothing for this venue: no matching city, local places or seed artists. Check the spelling of the city and the seed artists, then try again.";

/** Longest tool result sent back to the model. Free tiers cap tokens per minute, so large results are cut. */
const MAX_TOOL_RESULT_CHARS = 12_000;

export function toToolDefinitions(tools: AgentTool[]): ToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema,
  }));
}

function serializeResult(content: unknown): string {
  const text = JSON.stringify(content);
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}... [result cut for length. Call the tool again with a smaller take value if you need less.]`;
}

/**
 * Tool-use loop. The model chooses which Qloo calls to make; each call is parsed, validated
 * and executed here, and the result goes back to the model as a role "tool" message.
 * The loop ends when the final submit tool passes its validator.
 */
export async function runLiveAgent(args: LiveRunArgs): Promise<unknown> {
  const toolDefs = toToolDefinitions(args.tools);
  const messages: ChatMessage[] = [
    { role: "system", content: args.system },
    { role: "user", content: args.userMessage },
  ];
  let nudged = false;
  let qlooToolAttempted = false;

  for (let turn = 1; turn <= args.maxTurns; turn++) {
    const reply = await args.llm.chat(messages, toolDefs);

    if (reply.finishReason === "content_filter") {
      throw new LlmError("http", "The model declined this request. Adjust the venue details and try again.");
    }
    if (reply.finishReason === "length" && reply.toolCalls.length === 0) {
      throw new LlmError("http", "The model ran out of output space before finishing. Try again.");
    }

    messages.push(reply.assistantMessage);

    if (reply.text !== "") {
      args.emit({ type: "trace", step: makeStep("thought", truncate(reply.text, 280)) });
    }

    if (reply.toolCalls.length === 0) {
      // The model has tried Qloo and has nothing to build on. Asking it again would only repeat the empty lookups.
      if (qlooToolAttempted && !args.ctx.hasQlooResults()) {
        throw new QlooError(NO_QLOO_DATA_MESSAGE, 404, "/search");
      }
      if (nudged) {
        throw new LlmError(
          "bad_response",
          `The model replied with text twice instead of calling tools. Try again, or set LLM_MODEL to a model with stronger tool calling.`,
        );
      }
      nudged = true;
      messages.push({
        role: "user",
        content: `Reminder: do not describe what you would do. Call a tool now. Use the Qloo tools to gather data, then finish by calling ${args.finalTool}.`,
      });
      continue;
    }

    // Parallel calls run in the order the model listed them, and each gets its own tool message.
    for (const call of reply.toolCalls) {
      const tool = args.tools.find((t) => t.name === call.name);
      let content: string;

      if (!tool) {
        const names = args.tools.map((t) => t.name).join(", ");
        content = `Error: Unknown tool "${call.name}". Available tools: ${names}.`;
      } else {
        const parsed = parseToolArguments(call.argumentsText, tool.input_schema);
        if (!parsed.ok) {
          args.emit({
            type: "trace",
            step: makeStep("tool_result", `Error: ${parsed.error}`, { tool: tool.name }),
          });
          content = `Error: ${parsed.error}`;
        } else if (tool.name === args.finalTool && !qlooToolAttempted) {
          const error =
            "Rejected: you have not called any Qloo tool in this run. Call resolve_city, find_local_places or search_entities first, then get_insights, and submit only ids those tools returned.";
          args.emit({ type: "trace", step: makeStep("tool_result", `Error: ${error}`, { tool: tool.name }) });
          content = `Error: ${error}`;
        } else {
          if (QLOO_TOOLS.has(tool.name)) qlooToolAttempted = true;
          const outcome = await executeTool(tool, parsed.value, args.ctx, args.emit);
          if (outcome.ok && tool.name === args.finalTool) {
            args.emit({ type: "trace", step: makeStep("final", "Plan accepted by the validator.") });
            return outcome.content;
          }
          content = outcome.ok ? serializeResult(outcome.content) : `Error: ${outcome.error}`;
        }
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }

  if (qlooToolAttempted && !args.ctx.hasQlooResults()) {
    throw new QlooError(NO_QLOO_DATA_MESSAGE, 404, "/search");
  }
  throw new Error("The agent did not finish within its turn limit. Try again.");
}
