import { beforeEach, describe, expect, it } from "vitest";
import { clearQlooCache } from "../qloo/client";
import { entitiesFromSearchBody } from "../qloo/normalize";
import { mentionsCity, pickLocality, splitCity } from "./locality";
import { shortlistTools } from "./tools";
import { callTool, makeContext, scriptedTransport, searchOk } from "@/test/helpers";
import {
  ATHENS_GA_RESULTS,
  HEBDEN_BRIDGE_RESULTS,
  liveSearchBody,
  localityItem,
  placeItem,
  PORTLAND_ME_RESULTS,
} from "@/test/live-shapes";

const entities = (items: unknown[]) => entitiesFromSearchBody(liveSearchBody(items));

describe("splitCity", () => {
  it("separates the city name from the region parts", () => {
    expect(splitCity("Asheville, NC")).toEqual({ name: "Asheville", regions: ["NC"] });
    expect(splitCity("Lyon, Auvergne, FR")).toEqual({ name: "Lyon", regions: ["Auvergne", "FR"] });
    expect(splitCity("Nashville")).toEqual({ name: "Nashville", regions: [] });
    expect(splitCity(" , ")).toEqual({ name: "", regions: [] });
  });
});

describe("pickLocality", () => {
  it("picks the city in the named state over an earlier hit with the same name", () => {
    expect(pickLocality("Portland, ME", entities(PORTLAND_ME_RESULTS))?.id).toBe("loc-portland-me");
    expect(pickLocality("Portland, Maine", entities(PORTLAND_ME_RESULTS))?.id).toBe("loc-portland-me");
    expect(pickLocality("Portland, OR", entities(PORTLAND_ME_RESULTS))?.id).toBe("loc-portland-or");
  });

  it("keeps Qloo's order among exact name matches when no region is given", () => {
    expect(pickLocality("Portland", entities(PORTLAND_ME_RESULTS))?.id).toBe("loc-portland-or");
  });

  it("accepts a longer locality name that contains the city when the region agrees", () => {
    expect(pickLocality("Athens, GA", entities(ATHENS_GA_RESULTS))?.id).toBe("loc-athens-ga");
  });

  it("falls back to the first exact name match when the region is not found in Qloo's text", () => {
    expect(pickLocality("Athens, Attica", entities(ATHENS_GA_RESULTS))?.id).toBe("loc-athens-al");
  });

  it("returns null when no result carries the city's name", () => {
    expect(pickLocality("Hebden Bridge, UK", entities(HEBDEN_BRIDGE_RESULTS))).toBeNull();
    expect(pickLocality("Hebden Bridge", entities(HEBDEN_BRIDGE_RESULTS))).toBeNull();
    expect(pickLocality("Zzqxville", [])).toBeNull();
    expect(pickLocality(" , ", entities(PORTLAND_ME_RESULTS))).toBeNull();
  });

  it("ignores accents and case", () => {
    const torshavn = entities([localityItem("loc-torshavn", "Tórshavn", "Streymoyar sýsla, Føroyar", 62.01, -6.8)]);
    expect(pickLocality("torshavn", torshavn)?.id).toBe("loc-torshavn");
  });
});

describe("mentionsCity", () => {
  const [local, other] = entities([
    placeItem("p-1", "Trades Club", "Holme St Hebden Bridge HX7 8EE United Kingdom"),
    placeItem("p-2", "Fitzgerald's Bar", "437 McCarty Rd San Antonio, TX 78216"),
  ]);

  it("checks the address line for the city name as whole words", () => {
    expect(mentionsCity(local, "Hebden Bridge, UK")).toBe(true);
    expect(mentionsCity(other, "Hebden Bridge, UK")).toBe(false);
    expect(mentionsCity(other, "Antonio")).toBe(true);
    expect(mentionsCity(other, "Anton")).toBe(false);
  });

  it("is false for an entity with no address line", () => {
    expect(mentionsCity({ id: "x", name: "Hebden Bridge Bar", type: "urn:entity:place" }, "Hebden Bridge")).toBe(false);
  });
});

describe("resolve_city (mocked transport)", () => {
  beforeEach(() => clearQlooCache());
  const tools = shortlistTools();

  it("stores the matching locality's id, name and coordinates", async () => {
    const transport = scriptedTransport(() => searchOk(PORTLAND_ME_RESULTS));
    const ctx = makeContext(transport, { city: "Portland, ME" });
    const outcome = await callTool(ctx, tools, "resolve_city", { city: "Portland, ME" });

    expect(outcome.ok && outcome.summary).toBe("Resolved to Portland, Cumberland, Maine, United States of America");
    expect(ctx.localityId).toBe("loc-portland-me");
    expect(ctx.localityPoint).toEqual({ lat: 43.647, lon: -70.168 });
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0].params).toMatchObject({ query: "Portland, ME", types: "urn:entity:locality" });
  });

  it("searches again with the bare city name before giving up", async () => {
    const transport = scriptedTransport((_path, params) =>
      searchOk(params.query === "Athens" ? ATHENS_GA_RESULTS : HEBDEN_BRIDGE_RESULTS),
    );
    const ctx = makeContext(transport, { city: "Athens, GA" });
    const outcome = await callTool(ctx, tools, "resolve_city", { city: "Athens, GA" });

    expect(outcome.ok).toBe(true);
    expect(ctx.localityId).toBe("loc-athens-ga");
    expect(transport.calls.map((c) => c.params.query)).toEqual(["Athens, GA", "Athens"]);
  });

  it("fails with a readable message when Qloo only returns similar-sounding places", async () => {
    const transport = scriptedTransport(() => searchOk(HEBDEN_BRIDGE_RESULTS));
    const ctx = makeContext(transport, { city: "Hebden Bridge, UK" });
    const outcome = await callTool(ctx, tools, "resolve_city", { city: "Hebden Bridge, UK" });

    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error).toMatch(/no locality that matches "Hebden Bridge, UK"/);
    expect(ctx.localityId).toBeNull();
    expect(ctx.localityPoint).toBeNull();
  });

  it("fails cleanly on an empty result", async () => {
    const ctx = makeContext(scriptedTransport(() => searchOk([])), { city: "Zzqxville" });
    const outcome = await callTool(ctx, tools, "resolve_city", { city: "Zzqxville" });
    expect(outcome.ok).toBe(false);
  });
});
