import { beforeEach, describe, expect, it } from "vitest";
import { clearQlooCache } from "../qloo/client";
import { LOCATION_CHIP, shortlistTools } from "./tools";
import { callTool, insightsOk, makeContext, rawEntity, scriptedTransport, searchOk, type Handler } from "@/test/helpers";

const VELVET = rawEntity("artist-velvet", "Velvet Anchor");
const NIGHT = rawEntity("artist-night", "Night Ferry");
const LARK = rawEntity("artist-lark", "The Larkspur Hour");
const MARLOW = rawEntity("artist-marlow", "Marlow and the Tides");
const COPPER = rawEntity("artist-copper", "Copper Tennis");
const BRAND = rawEntity("brand-northgate", "Northgate Outdoor Co", "urn:entity:brand");
const LOCATION_ONLY = rawEntity("artist-glasshouse", "Glasshouse Kids");

const SEARCH_RESULTS: Record<string, unknown[]> = {
  "Velvet Anchor": [VELVET],
  "Night Ferry": [NIGHT],
  "Copper Tennis": [COPPER],
  "Northgate Outdoor Co": [BRAND],
};

/** Qloo answers: insights always return the seeds too, which the validator must still reject. */
const handler: Handler = (path, params) => {
  if (path === "/search") {
    const results = SEARCH_RESULTS[params.query] ?? [];
    return searchOk(params.types === "urn:entity:brand" ? results.filter((r) => (r as { type: string }).type === "urn:entity:brand") : results);
  }
  if (path === "/v2/insights") {
    if (params["signal.location.query"]) return insightsOk([LOCATION_ONLY]);
    if (params["filter.type"] === "urn:entity:brand") return insightsOk([BRAND]);
    return insightsOk([LARK, MARLOW, COPPER, VELVET, NIGHT]);
  }
  return { status: 404, body: { message: "unknown path" } };
};

const tools = shortlistTools();
const SEEDS = ["Velvet Anchor", "Night Ferry"];

/** Puts Velvet Anchor and Night Ferry in as seeds, then one insights run containing the candidates. */
async function setupRun(transport = scriptedTransport(handler)) {
  const ctx = makeContext(transport, { seedArtists: SEEDS });
  await callTool(ctx, tools, "search_entities", { query: "Velvet Anchor", entity_kind: "artist" });
  await callTool(ctx, tools, "search_entities", { query: "Night Ferry", entity_kind: "artist" });
  await callTool(ctx, tools, "search_entities", { query: "Copper Tennis", entity_kind: "artist" });
  await callTool(ctx, tools, "get_insights", { entity_kind: "artist", interest_entity_ids: ["artist-copper"] });
  return { ctx, transport };
}

const submit = (ctx: Parameters<typeof callTool>[0], ids: string[]) =>
  callTool(ctx, tools, "submit_shortlist", {
    summary: "Fits the room.",
    artists: ids.map((id) => ({ entity_id: id, why: "Appears in insights run 1 at rank 1." })),
  });

describe("submit_shortlist validator", () => {
  beforeEach(() => clearQlooCache());

  it("accepts artists that tool results returned in the same run", async () => {
    const { ctx } = await setupRun();
    const outcome = await submit(ctx, ["artist-lark", "artist-marlow", "artist-copper"]);
    expect(outcome.ok).toBe(true);
  });

  it("rejects an id that no tool returned", async () => {
    const { ctx } = await setupRun();
    const outcome = await submit(ctx, ["artist-lark", "artist-marlow", "artist-invented"]);
    expect(outcome).toMatchObject({ ok: false });
    if (!outcome.ok) expect(outcome.error).toMatch(/artist-invented was not returned by any tool/);
  });

  it("rejects ids that were only seen in an earlier run", async () => {
    const earlier = await setupRun();
    const ids = ["artist-lark", "artist-marlow", "artist-copper"];
    expect((await submit(earlier.ctx, ids)).ok).toBe(true);

    const fresh = makeContext(scriptedTransport(handler), { seedArtists: SEEDS });
    const outcome = await submit(fresh, ids);
    expect(outcome.ok).toBe(false);
  });

  it("rejects a seed artist matched by resolved id", async () => {
    const { ctx } = await setupRun();
    const outcome = await submit(ctx, ["artist-velvet", "artist-lark", "artist-marlow"]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/Velvet Anchor is one of this venue's seed artists/);
  });

  it("rejects a seed artist matched by normalised name when no search resolved its id", async () => {
    const alias = rawEntity("artist-velvet-alt", "  velvet   ANCHOR!! ");
    const transport = scriptedTransport((path, params) => {
      if (path === "/v2/insights") return insightsOk([alias, LARK, MARLOW]);
      return handler(path, params);
    });
    const ctx = makeContext(transport, { seedArtists: SEEDS });
    await callTool(ctx, tools, "search_entities", { query: "Copper Tennis", entity_kind: "artist" });
    await callTool(ctx, tools, "get_insights", { entity_kind: "artist", interest_entity_ids: ["artist-copper"] });
    const outcome = await submit(ctx, ["artist-velvet-alt", "artist-lark", "artist-marlow"]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/seed artists/);
  });

  it("needs three non-seed artists after exclusion, so one seed in three is rejected", async () => {
    const { ctx } = await setupRun();
    expect((await submit(ctx, ["artist-night", "artist-lark", "artist-marlow"])).ok).toBe(false);
    expect((await submit(ctx, ["artist-lark", "artist-marlow", "artist-copper"])).ok).toBe(true);
  });

  it("rejects a list shorter than three", async () => {
    const { ctx } = await setupRun();
    const outcome = await submit(ctx, ["artist-lark", "artist-marlow"]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/between 3 and 8/);
  });

  it("rejects an entity that is not an artist", async () => {
    const ctx = makeContext(scriptedTransport(handler), { seedArtists: SEEDS });
    await callTool(ctx, tools, "search_entities", { query: "Northgate Outdoor Co", entity_kind: "brand" });
    const outcome = await submit(ctx, ["brand-northgate", "artist-lark", "artist-marlow"]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/is a brand, not an artist/);
  });

  it("rejects the same artist twice", async () => {
    const { ctx } = await setupRun();
    const outcome = await submit(ctx, ["artist-lark", "artist-lark", "artist-marlow"]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/appears twice/);
  });

  it("rejects an artist that comes only from the experimental location signal", async () => {
    const { ctx } = await setupRun();
    await callTool(ctx, tools, "get_location_insights", {});
    const onlyLocation = await submit(ctx, ["artist-glasshouse", "artist-lark", "artist-marlow"]);
    expect(onlyLocation.ok).toBe(false);
    if (!onlyLocation.ok) expect(onlyLocation.error).toMatch(/only from the experimental location signal/);

    const withMeasured = await submit(ctx, ["artist-copper", "artist-lark", "artist-marlow"]);
    expect(withMeasured.ok).toBe(true);
  });

  it("labels location-signal evidence with the unconfirmed chip", async () => {
    const { ctx } = await setupRun();
    await callTool(ctx, tools, "get_location_insights", {});
    const entry = ctx.provenance.get("artist-glasshouse");
    expect(entry?.chips).toContainEqual({ label: LOCATION_CHIP, value: "Asheville, NC" });
  });

  it("sends seed artist ids to Qloo as filter.exclude.entities on artist insights only", async () => {
    const { transport } = await setupRun();
    const artistCall = transport.calls.find(
      (c) => c.path === "/v2/insights" && c.params["filter.type"] === "urn:entity:artist" && c.params["signal.interests.entities"] === "artist-copper",
    );
    expect(artistCall?.params["filter.exclude.entities"].split(",").sort()).toEqual(["artist-night", "artist-velvet"]);

    const ctx = makeContext(transport, { seedArtists: SEEDS });
    await callTool(ctx, tools, "search_entities", { query: "Northgate Outdoor Co", entity_kind: "brand" });
    await callTool(ctx, tools, "get_insights", { entity_kind: "brand", interest_entity_ids: ["brand-northgate"] });
    const brandCall = transport.calls.filter((c) => c.params["filter.type"] === "urn:entity:brand").pop();
    expect(brandCall?.params["filter.exclude.entities"]).toBeUndefined();
  });
});
