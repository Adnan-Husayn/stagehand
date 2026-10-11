import { getConfig } from "../config";
import { createQlooClient, liveTransport } from "../qloo/client";
import { fixtureTransport } from "../demo/fixture-transport";
import type { AgentEvent, PromoPlan, ShortlistResult, StartRequest } from "../types/stagehand";
import { RunContext } from "./context";
import { promoDemoPlan, runDemoAgent, shortlistDemoPlan } from "./demo";
import { makeStep } from "./exec";
import { createLlmClient } from "./llm";
import { runLiveAgent } from "./live";
import { promoTools, shortlistTools } from "./tools";
import { promoUserMessage, PROMO_SYSTEM, SHORTLIST_SYSTEM, shortlistUserMessage } from "./prompts";
import type { Emit } from "./types";

/** Most model turns one run may take. */
export const MAX_TURNS = 14;

/** Runs one Stagehand job and streams trace events. Returns after the result event is emitted. */
export async function runStagehand(request: StartRequest, emit: Emit): Promise<void> {
  const config = getConfig();
  const client = config.demo
    ? createQlooClient(fixtureTransport(), "demo", { debug: config.debugQloo })
    : createQlooClient(liveTransport(config.qlooBaseUrl, config.qlooApiKey ?? ""), "live", { debug: config.debugQloo });
  const ctx = new RunContext(client, request.venue, config.demo);

  if (request.mode === "promo") {
    ctx.artist = { entityId: request.artist.entityId, name: request.artist.name };
    ctx.remember(
      { id: request.artist.entityId, name: request.artist.name, type: "urn:entity:artist" },
      "selected",
      [{ label: "Selected for promo", value: "from the shortlist" }],
    );
  }

  const tools = request.mode === "shortlist" ? shortlistTools() : promoTools();
  const finalTool = request.mode === "shortlist" ? "submit_shortlist" : "submit_promo_plan";

  emit({
    type: "trace",
    step: makeStep(
      "status",
      config.demo
        ? "Demo mode: replaying a fixed sample run."
        : "Live run started with the Qloo API and a language model.",
    ),
  });

  let data: unknown;
  if (config.demo) {
    const plan =
      request.mode === "shortlist" ? shortlistDemoPlan(request.venue) : promoDemoPlan(request.venue);
    data = await runDemoAgent({ steps: plan.steps, final: plan.final, finalTool, tools, ctx, emit });
  } else {
    data = await runLiveAgent({
      llm: createLlmClient({
        apiKey: config.llmApiKey ?? "",
        baseUrl: config.llmBaseUrl,
        model: config.llmModel,
        temperature: config.llmTemperature,
        thinking: config.llmThinking,
      }),
      system: request.mode === "shortlist" ? SHORTLIST_SYSTEM : PROMO_SYSTEM,
      userMessage:
        request.mode === "shortlist"
          ? shortlistUserMessage(request.venue)
          : promoUserMessage(request.venue, request.artist),
      tools,
      ctx,
      finalTool,
      maxTurns: MAX_TURNS,
      emit,
    });
  }

  const event: AgentEvent = { type: "result", data: data as ShortlistResult | PromoPlan };
  emit(event);
}
