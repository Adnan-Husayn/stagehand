// Live model check. Sends real requests to a model provider, so it is off unless LIVE_LLM=1.
// Run it with `npm run live:check`. See "Live model check" in README.md.
//
// What it does:
//   1. Sends one request per tool list with the real system prompt and every real tool schema.
//   2. Runs LIVE_RUNS shortlist loops and LIVE_RUNS promo loops with the real client, real tools and
//      validators, against the sample-data Qloo transport (the real Qloo API is not called).
//   3. Prints a compact trace, per-run results and a summary table.
//
// The key is read from the file named by LLM_KEY_FILE. It is never printed, logged or written anywhere.
import { describe, expect, it } from "vitest";
import { fixtureTransport } from "@/lib/demo/fixture-transport";
import { RunContext } from "@/lib/agent/context";
import {
  formatSummaryTable,
  intFromEnv,
  readKeyFile,
  redact,
  RequestGate,
  resolveProvider,
  sessionRequests,
  sessionsPerDay,
  summariseKind,
  verdict,
  type RunSummary,
} from "@/lib/agent/live-check";
import { createLlmClient, LlmError, type ChatMessage, type LlmClient } from "@/lib/agent/llm";
import { runLiveAgent, toToolDefinitions } from "@/lib/agent/live";
import { PROMO_SYSTEM, promoUserMessage, SHORTLIST_SYSTEM, shortlistUserMessage } from "@/lib/agent/prompts";
import { MAX_TURNS } from "@/lib/agent/run";
import { parseToolArguments } from "@/lib/agent/tool-args";
import { promoTools, shortlistTools } from "@/lib/agent/tools";
import { clearQlooCache, createQlooClient } from "@/lib/qloo/client";
import type { PromoPlan, ShortlistResult, TraceStep, VenueProfile } from "@/lib/types/stagehand";

const VENUE: VenueProfile = {
  venueName: "The Lantern Room",
  city: "Asheville, NC",
  capacity: 300,
  genres: ["indie folk", "dream pop", "americana"],
  seedArtists: ["Velvet Anchor", "Night Ferry"],
};

/** Used when no shortlist run produced an artist to plan a promo for. A fictional sample artist. */
const FALLBACK_ARTIST = { entityId: "sample-artist-the-larkspur-hour", name: "The Larkspur Hour" };

const enabled = process.env.LIVE_LLM === "1";

describe.skipIf(!enabled)("live model check (sample Qloo data, real model)", () => {
  it(
    "accepts the schemas and completes the shortlist and promo loops",
    async () => {
      const keyFile = process.env.LLM_KEY_FILE;
      if (!keyFile) throw new Error("Set LLM_KEY_FILE to the path of a file that holds the model key.");
      const key = readKeyFile(keyFile);
      const settings = resolveProvider(process.env);
      const runsPerKind = intFromEnv(process.env.LIVE_RUNS, 3, 1, 20);
      const maxRequests = intFromEnv(process.env.LIVE_MAX_REQUESTS, 80, 1, 5000);
      const minIntervalMs = intFromEnv(process.env.LIVE_MIN_INTERVAL_MS, 4000, 0, 120_000);
      const dailyRequests = intFromEnv(process.env.LIVE_DAILY_REQUESTS, 0, 0, 10_000_000);

      const out = (line = "") => process.stdout.write(`${redact(line, key)}\n`);
      const gate = new RequestGate({ maxRequests, minIntervalMs, key });
      const baseLlm = createLlmClient({
        apiKey: key,
        baseUrl: settings.baseUrl,
        model: settings.model,
        temperature: settings.temperature,
        thinking: settings.thinking,
        fetchImpl: gate.wrap((input, init) => fetch(input, init)),
      });

      out(`Live check: provider=${settings.provider} model=${settings.model} base=${settings.baseUrl}`);
      out(
        `temperature=${settings.temperature ?? "not sent"} thinking=${settings.thinking ?? "not sent"} ` +
          `runs per kind=${runsPerKind} max requests=${maxRequests} min interval=${minIntervalMs}ms`,
      );

      // 1. Schema acceptance, once per tool list.
      out("\n== Schema acceptance ==");
      let schemaOk = true;
      const schemaCases: { label: string; system: string; user: string; tools: ReturnType<typeof toToolDefinitions> }[] = [
        {
          label: "shortlist",
          system: SHORTLIST_SYSTEM,
          user: shortlistUserMessage(VENUE),
          tools: toToolDefinitions(shortlistTools()),
        },
        {
          label: "promo",
          system: PROMO_SYSTEM,
          user: promoUserMessage(VENUE, FALLBACK_ARTIST),
          tools: toToolDefinitions(promoTools()),
        },
      ];
      for (const c of schemaCases) {
        const messages: ChatMessage[] = [
          { role: "system", content: c.system },
          { role: "user", content: c.user },
        ];
        try {
          const reply = await baseLlm.chat(messages, c.tools);
          const what =
            reply.toolCalls.length > 0
              ? `tool call ${reply.toolCalls.map((t) => t.name).join(", ")}`
              : `text (${reply.text.length} characters)`;
          out(`${c.label}: accepted with ${c.tools.length} tools. Reply: ${what}. finish=${reply.finishReason ?? "none"}`);
        } catch (err) {
          schemaOk = false;
          const detail = err instanceof LlmError ? `${err.kind}: ${err.message}` : String(err);
          out(`${c.label}: REJECTED. ${detail}`);
        }
      }
      if (!schemaOk) {
        out("\nThe provider rejected a request, so the loops were not run. Read the message above, fix the schema conversion in src/lib/agent/llm.ts and run again.");
        expect(schemaOk).toBe(true);
        return;
      }

      // 2. Full loops against the sample Qloo transport.
      const summaries: RunSummary[] = [];
      const topArtists: { entityId: string; name: string }[] = [];

      async function runOne(kind: "shortlist" | "promo", index: number, artist: { entityId: string; name: string }) {
        clearQlooCache();
        const label = `${kind} run ${index + 1}/${runsPerKind}`;
        out(`\n== ${label} ==`);
        const ctx = new RunContext(createQlooClient(fixtureTransport(), "demo"), VENUE, true);
        if (kind === "promo") {
          ctx.artist = { entityId: artist.entityId, name: artist.name };
          ctx.remember(
            { id: artist.entityId, name: artist.name, type: "urn:entity:artist" },
            "selected",
            [{ label: "Selected for promo", value: "from the shortlist" }],
          );
          out(`artist: ${artist.name}`);
        }

        let turn = 0;
        const logged: LlmClient = {
          async chat(messages, tools) {
            turn += 1;
            const reply = await baseLlm.chat(messages, tools);
            const calls = reply.toolCalls.map((c) => {
              let state: string;
              try {
                JSON.parse(c.argumentsText);
                state = "clean";
              } catch {
                state = parseToolArguments(c.argumentsText).ok ? "repaired" : "unparseable";
              }
              return `${c.name} [args ${state}]`;
            });
            const usage = reply.usage ? ` tokens=${reply.usage.promptTokens}/${reply.usage.completionTokens}` : "";
            out(
              `T${turn} finish=${reply.finishReason ?? "none"} calls=${calls.length > 0 ? calls.join(", ") : "none"}` +
                `${reply.text ? ` text="${reply.text.slice(0, 80).replace(/\s+/g, " ")}"` : ""}${usage}`,
            );
            return reply;
          },
        };
        const emit = (event: { type: string; step?: TraceStep }) => {
          if (event.type !== "trace" || !event.step) return;
          const step = event.step;
          if (step.kind === "tool_call") out(`   call   ${step.detail}`);
          else if (step.kind === "tool_result") {
            const rejected = step.detail.startsWith("Error:");
            out(`   ${rejected ? "REJECT" : "result"} ${step.detail}${step.durationMs !== undefined ? ` (${step.durationMs}ms)` : ""}`);
          } else if (step.kind === "final") out(`   final  ${step.detail}`);
        };

        const requestsBefore = gate.count;
        const paceBefore = gate.paceWaitedMs;
        const started = Date.now();
        let ok = false;
        let note = "";
        try {
          const result = await runLiveAgent({
            llm: logged,
            system: kind === "shortlist" ? SHORTLIST_SYSTEM : PROMO_SYSTEM,
            userMessage: kind === "shortlist" ? shortlistUserMessage(VENUE) : promoUserMessage(VENUE, artist),
            tools: kind === "shortlist" ? shortlistTools() : promoTools(),
            ctx,
            finalTool: kind === "shortlist" ? "submit_shortlist" : "submit_promo_plan",
            maxTurns: MAX_TURNS,
            emit: emit as Parameters<typeof runLiveAgent>[0]["emit"],
          });
          // Independent grounding check on top of the validators.
          const problems: string[] = [];
          if (kind === "shortlist") {
            const list = result as ShortlistResult;
            for (const a of list.artists) {
              const entity = ctx.entityOf(a.entityId);
              if (!entity) problems.push(`${a.name} has no Qloo record in this run`);
              else if (ctx.isSeedArtist(entity)) problems.push(`${a.name} is a seed`);
              if (a.evidence.length === 0) problems.push(`${a.name} has no evidence chips`);
            }
            topArtists[index] = { entityId: list.artists[0].entityId, name: list.artists[0].name };
            out(`   shortlist: ${list.artists.map((a) => a.name).join(" > ")}`);
          } else {
            const plan = result as PromoPlan;
            for (const p of plan.partners) if (!ctx.knows(p.entityId)) problems.push(`${p.name} has no Qloo record in this run`);
            for (const t of plan.adTargeting) for (const b of t.basedOn) if (!ctx.knows(b.entityId)) problems.push(`ad target cites unknown id`);
            out(`   partners: ${plan.partners.map((p) => `${p.name} (${p.kind})`).join(", ")}`);
          }
          ok = problems.length === 0;
          note = ok ? "valid" : `grounding check failed: ${problems.join("; ")}`;
        } catch (err) {
          note = err instanceof LlmError ? `${err.kind}: ${err.message}` : err instanceof Error ? err.message : String(err);
        }
        const grossMs = Date.now() - started;
        const netMs = Math.max(0, grossMs - (gate.paceWaitedMs - paceBefore));
        const requests = gate.count - requestsBefore;
        const tokens = gate.tokensSince(requestsBefore);
        out(
          `   outcome: ${ok ? "VALID" : "FAILED"} (${note}) turns=${turn} requests=${requests} ` +
            `time=${(netMs / 1000).toFixed(1)}s (${(grossMs / 1000).toFixed(1)}s with pacing)` +
            `${tokens.reported ? ` tokens=${tokens.total}` : " tokens=not reported"}`,
        );
        // A run cut short by the request budget or a daily quota says nothing about the model.
        if (!ok && gate.haltReason) return;
        summaries.push({ kind, ok, note, turns: turn, requests, grossMs, netMs, tokens });
      }

      for (let i = 0; i < runsPerKind && !gate.haltReason; i++) await runOne("shortlist", i, FALLBACK_ARTIST);
      const firstArtist = topArtists.find((a) => a !== undefined);
      for (let i = 0; i < runsPerKind && !gate.haltReason; i++) {
        await runOne("promo", i, topArtists[i] ?? firstArtist ?? FALLBACK_ARTIST);
      }

      // 3. Summary.
      const shortlist = summariseKind("shortlist", summaries);
      const promo = summariseKind("promo", summaries);
      out("\n== Summary ==");
      out(formatSummaryTable([shortlist, promo]));
      out(`\nModel requests sent: ${gate.count} of ${maxRequests} allowed (retries included).`);
      const perSession = sessionRequests(shortlist, promo);
      if (perSession !== null) {
        out(`One session (shortlist plus one promo plan), median requests: ${perSession}.`);
        if (dailyRequests > 0) {
          out(`At an assumed ${dailyRequests} requests per day, that is about ${sessionsPerDay(dailyRequests, perSession)} sessions per day.`);
        } else {
          out("Set LIVE_DAILY_REQUESTS to your quota to estimate sessions per day.");
        }
      }
      const slowest = Math.max(shortlist.maxNetSeconds ?? 0, promo.maxNetSeconds ?? 0);
      out(`Slowest run: ${slowest.toFixed(1)}s against the 300s function limit. Model time only; sample-data Qloo calls add almost nothing.`);
      if (gate.rateLimitHeaders.size > 0) {
        out("Rate-limit headers seen:");
        for (const [name, value] of gate.rateLimitHeaders) out(`  ${name}: ${value}`);
      } else {
        out("Rate-limit headers seen: none.");
      }
      if (gate.rateLimitErrors.length > 0) {
        out(`Rate-limit responses (${gate.rateLimitErrors.length}):`);
        for (const e of gate.rateLimitErrors.slice(0, 3)) out(`  ${e}`);
      }
      const failures = summaries.filter((s) => !s.ok);
      if (failures.length > 0) {
        out("Failures:");
        for (const f of failures) out(`  ${f.kind}: ${f.note}`);
      }
      if (gate.haltReason) out(`Stopped early: ${gate.haltReason}`);

      const result = verdict(schemaOk, [shortlist, promo]);
      out(`\nLIVE CHECK ${result.pass ? "PASSED" : "FAILED"}${result.reasons.length > 0 ? `: ${result.reasons.join(" ")}` : ""}`);
      expect(result.reasons).toEqual([]);
    },
  );
});
