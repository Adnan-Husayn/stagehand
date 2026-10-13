import { beforeEach, describe, expect, it } from "vitest";
import { clearQlooCache } from "../qloo/client";
import type { AgentEvent, ShortlistResult } from "../types/stagehand";
import { NO_QLOO_DATA_MESSAGE, runLiveAgent } from "./live";
import { parseChatResponse, type ChatMessage, type ChatReply, type LlmClient } from "./llm";
import { SHORTLIST_SYSTEM, shortlistUserMessage } from "./prompts";
import { shortlistTools } from "./tools";
import { insightsOk, makeContext, scriptedTransport, searchOk, type Handler } from "@/test/helpers";
import { insightItem, localityItem, placeItem, searchItem } from "@/test/live-shapes";

interface Call {
  name: string;
  args: unknown;
  id?: string;
}

/** Builds a reply the way a provider would send it, then runs it through the real parser. */
function toolReply(calls: Call[], text = ""): ChatReply {
  return parseChatResponse({
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: text || null,
          tool_calls: calls.map((c) => ({
            ...(c.id ? { id: c.id } : {}),
            type: "function",
            function: { name: c.name, arguments: typeof c.args === "string" ? c.args : JSON.stringify(c.args) },
          })),
        },
      },
    ],
  });
}

function textReply(text: string): ChatReply {
  return parseChatResponse({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: text } }] });
}

/** A scripted fake model. It records the history it was sent on every turn. */
function fakeModel(script: ChatReply[]): LlmClient & { seen: ChatMessage[][] } {
  const seen: ChatMessage[][] = [];
  let turn = 0;
  return {
    seen,
    async chat(messages) {
      seen.push(JSON.parse(JSON.stringify(messages)) as ChatMessage[]);
      const reply = script[turn++];
      if (!reply) throw new Error("The fake model ran out of scripted replies.");
      return reply;
    },
  };
}

// Fixtures use the live response shapes: search items list their kind in types, insights items in subtype.
const LOCALITY = localityItem("loc-ash", "Asheville", "Buncombe, North Carolina, United States of America", 35.57, -82.55);
const PLACE_A = placeItem("place-a", "Mountain Taproom", "101 Biltmore Ave Asheville, NC 28801");
const PLACE_B = placeItem("place-b", "Grey Eagle Records", "185 Clingman Ave Asheville, NC 28801");
const VELVET = searchItem("artist-velvet", "Velvet Anchor", "artist");
const NIGHT = searchItem("artist-night", "Night Ferry", "artist");
const LARK = insightItem("artist-lark", "The Larkspur Hour", "artist", 0.97);
const MARLOW = insightItem("artist-marlow", "Marlow and the Tides", "artist", 0.95);
const COPPER = insightItem("artist-copper", "Copper Tennis", "artist", 0.94);
const VELVET_INSIGHT = insightItem("artist-velvet", "Velvet Anchor", "artist", 0.93);

const handler: Handler = (path, params) => {
  if (path === "/search") {
    if (params.types === "urn:entity:locality") return searchOk([LOCALITY]);
    if (params.types === "urn:entity:place") return searchOk([PLACE_A, PLACE_B]);
    if (params.query === "Velvet Anchor") return searchOk([VELVET]);
    if (params.query === "Night Ferry") return searchOk([NIGHT]);
    return searchOk([]);
  }
  if (path === "/v2/insights") {
    // The seeds come back too. The submit validator must still keep them out.
    return insightsOk([LARK, MARLOW, COPPER, VELVET_INSIGHT]);
  }
  return { status: 404, body: { message: "unknown path" } };
};

const VENUE = { seedArtists: ["Velvet Anchor", "Night Ferry"] };

function setup(script: ChatReply[]) {
  const transport = scriptedTransport(handler);
  const ctx = makeContext(transport, VENUE);
  const llm = fakeModel(script);
  const events: AgentEvent[] = [];
  const run = () =>
    runLiveAgent({
      llm,
      system: SHORTLIST_SYSTEM,
      userMessage: shortlistUserMessage({ venueName: "", city: "Asheville, NC", capacity: 300, genres: [], seedArtists: VENUE.seedArtists }),
      tools: shortlistTools(),
      ctx,
      finalTool: "submit_shortlist",
      maxTurns: 14,
      emit: (event) => events.push(event),
    });
  return { run, llm, events, transport };
}

const goodSubmit = (ids: string[]): Call => ({
  name: "submit_shortlist",
  args: { summary: "Fits the room.", artists: ids.map((id) => ({ entity_id: id, why: "Insights run 1 rank 1." })) },
});

function toolMessages(history: ChatMessage[]) {
  return history.filter((m): m is Extract<ChatMessage, { role: "tool" }> => m.role === "tool");
}

describe("live agent loop with a scripted fake model", () => {
  beforeEach(() => clearQlooCache());

  it("reaches a valid submit_shortlist end to end", async () => {
    const { run, llm, events, transport } = setup([
      toolReply([{ name: "resolve_city", args: { city: "Asheville, NC" } }], "Resolving the city."),
      toolReply([{ name: "find_local_places", args: { query: "live music bar" } }]),
      // Parallel calls without ids, one of them with arguments wrapped in a string.
      toolReply([
        { name: "search_entities", args: { query: "Velvet Anchor", entity_kind: "artist" } },
        { name: "search_entities", args: { arguments: JSON.stringify({ query: "Night Ferry", entity_kind: "artist" }) } },
      ]),
      toolReply([
        // interest ids arrive as a JSON string, which the loop repairs.
        { name: "get_insights", args: { entity_kind: "artist", interest_entity_ids: '["place-a","place-b"]' } },
      ]),
      // A seed is rejected by the validator and the model fixes it.
      toolReply([goodSubmit(["artist-velvet", "artist-lark", "artist-marlow"])]),
      toolReply([goodSubmit(["artist-lark", "artist-marlow", "artist-copper"])]),
    ]);

    const result = (await run()) as ShortlistResult;

    expect(result.mode).toBe("shortlist");
    expect(result.artists.map((a) => a.name)).toEqual(["The Larkspur Hour", "Marlow and the Tides", "Copper Tennis"]);
    expect(result.artists.every((a) => a.evidence.length > 0)).toBe(true);
    expect(result.artists.map((a) => a.name)).not.toContain("Velvet Anchor");

    // The seed rejection reached the model as a tool error.
    const finalHistory = llm.seen[llm.seen.length - 1];
    const lastTool = toolMessages(finalHistory).at(-1);
    expect(lastTool?.content).toMatch(/seed artists/);

    // Parallel calls produced one tool message each, with distinct generated ids.
    const parallelIds = toolMessages(llm.seen[3]).slice(-2).map((m) => m.tool_call_id);
    expect(new Set(parallelIds).size).toBe(2);

    expect(transport.calls.length).toBeGreaterThan(3);
    expect(events.filter((e) => e.type === "trace" && e.step.kind === "final")).toHaveLength(1);
    expect(events.some((e) => e.type === "trace" && e.step.kind === "thought" && e.step.detail === "Resolving the city.")).toBe(true);
  });

  it("feeds malformed tool arguments back as an error instead of crashing", async () => {
    const { run, llm } = setup([
      toolReply([{ name: "resolve_city", args: '{"city": "Asheville' }]),
      toolReply([{ name: "resolve_city", args: { city: "Asheville, NC" } }]),
      toolReply([{ name: "get_insights", args: { entity_kind: "artist", interest_entity_ids: ["place-a"] } }]),
      toolReply([{ name: "find_local_places", args: { query: "bar" } }]),
      toolReply([{ name: "get_insights", args: { entity_kind: "artist", interest_entity_ids: ["place-a"] } }]),
      toolReply([goodSubmit(["artist-lark", "artist-marlow", "artist-copper"])]),
    ]);
    const result = (await run()) as ShortlistResult;
    expect(result.artists).toHaveLength(3);
    const firstError = toolMessages(llm.seen[1])[0];
    expect(firstError.content).toMatch(/^Error: .*not valid JSON/);
    // The unknown id in the third call was also returned as a tool error.
    expect(toolMessages(llm.seen[3]).at(-1)?.content).toMatch(/not returned by any earlier tool/);
  });

  it("answers an unknown tool name with the list of real tools", async () => {
    const { run, llm } = setup([
      toolReply([{ name: "web_search", args: { query: "x" } }]),
      toolReply([{ name: "resolve_city", args: { city: "Asheville, NC" } }]),
      toolReply([{ name: "find_local_places", args: { query: "bar" } }]),
      toolReply([{ name: "get_insights", args: { entity_kind: "artist", interest_entity_ids: ["place-a"] } }]),
      toolReply([goodSubmit(["artist-lark", "artist-marlow", "artist-copper"])]),
    ]);
    await run();
    expect(toolMessages(llm.seen[1])[0].content).toMatch(/Unknown tool "web_search"\. Available tools: .*submit_shortlist/);
  });

  it("nudges once when the model replies with plain text, then continues", async () => {
    const { run, llm } = setup([
      textReply("I will look up the city and then the places."),
      toolReply([{ name: "resolve_city", args: { city: "Asheville, NC" } }]),
      toolReply([{ name: "find_local_places", args: { query: "bar" } }]),
      toolReply([{ name: "get_insights", args: { entity_kind: "artist", interest_entity_ids: ["place-a"] } }]),
      toolReply([goodSubmit(["artist-lark", "artist-marlow", "artist-copper"])]),
    ]);
    const result = (await run()) as ShortlistResult;
    expect(result.artists).toHaveLength(3);
    const second = llm.seen[1];
    const nudge = second[second.length - 1];
    expect(nudge.role).toBe("user");
    expect(nudge.content).toMatch(/Call a tool now/);
    expect(nudge.content).toMatch(/submit_shortlist/);
  });

  it("fails clearly if the model answers with text a second time", async () => {
    const { run } = setup([textReply("First."), textReply("Second.")]);
    await expect(run()).rejects.toThrow(/replied with text twice/);
  });

  it("ends with a plain no-data message when every Qloo lookup was empty and the model stops calling tools", async () => {
    const empty = scriptedTransport((path, params) =>
      path === "/search" ? searchOk(params.query === "indie rock" ? [VELVET] : []) : insightsOk([]),
    );
    const llm = fakeModel([
      toolReply([{ name: "resolve_city", args: { city: "Zzqxville, QQ" } }]),
      toolReply([{ name: "find_local_places", args: { query: "live music bar" } }]),
      toolReply([{ name: "search_entities", args: { query: "Nobody At All", entity_kind: "artist" } }]),
      // A loose name search that happens to match something is not data about this venue.
      toolReply([{ name: "search_entities", args: { query: "indie rock", entity_kind: "artist" } }]),
      textReply("Every lookup came back empty, so I cannot build a shortlist."),
      toolReply([{ name: "resolve_city", args: { city: "Zzqxville, QQ" } }]),
    ]);
    const events: AgentEvent[] = [];
    const run = runLiveAgent({
      llm,
      system: SHORTLIST_SYSTEM,
      userMessage: "u",
      tools: shortlistTools(),
      ctx: makeContext(empty, { city: "Zzqxville, QQ", seedArtists: ["Nobody At All"] }),
      finalTool: "submit_shortlist",
      maxTurns: 14,
      emit: (event) => events.push(event),
    });

    await expect(run).rejects.toThrow(NO_QLOO_DATA_MESSAGE);
    // The run stops at the text reply. No nudge, no repeat lookups.
    expect(llm.seen).toHaveLength(5);
  });

  it("gives the no-data message at the turn limit too", async () => {
    const empty = scriptedTransport((path) => (path === "/search" ? searchOk([]) : insightsOk([])));
    const script = Array.from({ length: 3 }, () => toolReply([{ name: "find_local_places", args: { query: "bar" } }]));
    await expect(
      runLiveAgent({
        llm: fakeModel(script),
        system: "s",
        userMessage: "u",
        tools: shortlistTools(),
        ctx: makeContext(empty, { city: "Zzqxville, QQ" }),
        finalTool: "submit_shortlist",
        maxTurns: 3,
        emit: () => {},
      }),
    ).rejects.toThrow(NO_QLOO_DATA_MESSAGE);
  });

  it("rejects a submit that comes before any Qloo tool call and lets the model recover", async () => {
    const { run, llm, transport } = setup([
      toolReply([goodSubmit(["artist-lark", "artist-marlow", "artist-copper"])]),
      toolReply([{ name: "resolve_city", args: { city: "Asheville, NC" } }]),
      toolReply([{ name: "find_local_places", args: { query: "bar" } }]),
      toolReply([{ name: "get_insights", args: { entity_kind: "artist", interest_entity_ids: ["place-a"] } }]),
      toolReply([goodSubmit(["artist-lark", "artist-marlow", "artist-copper"])]),
    ]);
    const result = (await run()) as ShortlistResult;
    expect(result.artists).toHaveLength(3);
    expect(toolMessages(llm.seen[1])[0].content).toMatch(/not called any Qloo tool/);
    // The rejected submit made no Qloo request.
    expect(transport.calls.length).toBeGreaterThan(0);
  });

  it("stops at the turn limit", async () => {
    const script = Array.from({ length: 3 }, () => toolReply([{ name: "resolve_city", args: { city: "Asheville, NC" } }]));
    const transport = scriptedTransport(handler);
    const llm = fakeModel(script);
    await expect(
      runLiveAgent({
        llm,
        system: "s",
        userMessage: "u",
        tools: shortlistTools(),
        ctx: makeContext(transport, VENUE),
        finalTool: "submit_shortlist",
        maxTurns: 3,
        emit: () => {},
      }),
    ).rejects.toThrow(/turn limit/);
  });
});
