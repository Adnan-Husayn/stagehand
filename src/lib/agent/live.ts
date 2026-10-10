import Anthropic from "@anthropic-ai/sdk";
import type { RunContext } from "./context";
import { executeTool, makeStep, truncate } from "./exec";
import type { AgentTool, Emit } from "./types";

export interface LiveRunArgs {
  apiKey: string;
  model: string;
  system: string;
  userMessage: string;
  tools: AgentTool[];
  ctx: RunContext;
  finalTool: string;
  maxTurns: number;
  emit: Emit;
}

/**
 * Tool-use loop. The model chooses which Qloo calls to make; each call is validated
 * and executed here, and the result is returned to the model. The loop ends when
 * the final submit tool passes validation.
 */
export async function runLiveAgent(args: LiveRunArgs): Promise<unknown> {
  const client = new Anthropic({ apiKey: args.apiKey, maxRetries: 2, timeout: 90_000 });
  const toolDefs: Anthropic.Tool[] = args.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema,
  }));
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: args.userMessage }];

  for (let turn = 1; turn <= args.maxTurns; turn++) {
    const response = await client.messages.create({
      model: args.model,
      max_tokens: 8000,
      system: args.system,
      tools: toolDefs,
      messages,
      thinking: { type: "adaptive" },
    });

    if (response.stop_reason === "refusal") {
      throw new Error("The model declined this request. Adjust the venue details and try again.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("The model ran out of output space before finishing.");
    }

    messages.push({ role: "assistant", content: response.content });

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim() !== "") {
        args.emit({ type: "trace", step: makeStep("thought", truncate(block.text.trim(), 280)) });
      }
    }

    const toolUses = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    if (toolUses.length === 0) {
      messages.push({
        role: "user",
        content: `Continue with the tools. Finish by calling ${args.finalTool}.`,
      });
      continue;
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const tool = args.tools.find((t) => t.name === use.name);
      if (!tool) {
        results.push({ type: "tool_result", tool_use_id: use.id, content: `Unknown tool: ${use.name}`, is_error: true });
        continue;
      }
      const outcome = await executeTool(tool, use.input, args.ctx, args.emit);
      if (outcome.ok && use.name === args.finalTool) {
        args.emit({ type: "trace", step: makeStep("final", "Plan accepted by the validator.") });
        return outcome.content;
      }
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: outcome.ok ? JSON.stringify(outcome.content) : `Error: ${outcome.error}`,
        is_error: !outcome.ok,
      });
    }
    messages.push({ role: "user", content: results });
  }

  throw new Error("The agent did not finish within its turn limit. Try again.");
}
