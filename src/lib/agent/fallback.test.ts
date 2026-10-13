import { beforeEach, describe, expect, it } from "vitest";
import { clearQlooCache, QlooError } from "../qloo/client";
import { firstUsable } from "./fallback";
import { promoTools, shortlistTools } from "./tools";
import {
  callTool,
  insightsOk,
  makeContext,
  scriptedTransport,
  searchOk,
  type Handler,
  type Reply,
} from "@/test/helpers";
import { insightPlace, localityItem, placeItem, SEARCH_BAD_LOCATION } from "@/test/live-shapes";

const LOCALITY = localityItem("loc-asheville", "Asheville", "Buncombe, North Carolina, United States of America", 35.57, -82.55);
const POINT = "35.57,-82.55";
const PLACE_A = placeItem("place-gilded", "The Gilded Tap", "12 College St Asheville, NC 28801");
const PLACE_B = placeItem("place-record", "Corner Record Bar", "55 Haywood Rd Asheville, NC 28806", 35.58, -82.59);
const PLACE_ELSEWHERE = placeItem("place-texas", "Live Music Bar", "437 McCarty Rd San Antonio, TX 78216", 29.5, -98.5);
const INSIGHT_PLACE = insightPlace("place-gilded", "The Gilded Tap", "12 College St Asheville, NC 28801");
const INSIGHT_ELSEWHERE = insightPlace("place-tipton", "Tipton Sports Academy", "Wednesbury Oak Rd Tipton DY4 0BS United Kingdom");
const NO_RESULTS: Reply = searchOk([]);
const BAD_PARAMS: Reply = { status: 400, body: SEARCH_BAD_LOCATION };
const UNAUTHORIZED: Reply = { status: 401, body: { message: "bad key" } };
const NOT_FOUND_PATH: Reply = { status: 404, body: { message: "path not found" } };

/** Locality search answers with Asheville. Place searches and place insights go to the test's strategy function. */
function placeHandler(placeStrategy: (params: Record<string, string>) => Reply): Handler {
  return (path, params) => {
    if (path === "/search" && params.types === "urn:entity:locality") return searchOk([LOCALITY]);
    if (path === "/search" && params.types === "urn:entity:place") return placeStrategy(params);
    if (path === "/v2/insights") return placeStrategy(params);
    return NOT_FOUND_PATH;
  };
}

const tools = shortlistTools();
const promo = promoTools();

describe("firstUsable", () => {
  it("returns the first non-empty result and records every attempt", async () => {
    const outcome = await firstUsable(
      [
        { name: "one", run: async () => [] as string[] },
        { name: "two", run: async () => ["hit"] },
        { name: "three", run: async () => ["never reached"] },
      ],
      (v) => v.length === 0,
    );
    expect(outcome.strategy).toBe("two");
    expect(outcome.value).toEqual(["hit"]);
    expect(outcome.attempts).toEqual(["one: no results", "two: results"]);
  });

  it("moves past 400 and 404 errors", async () => {
    const outcome = await firstUsable(
      [
        {
          name: "bad",
          run: async () => {
            throw new QlooError("bad", 400, "/search");
          },
        },
        {
          name: "missing",
          run: async () => {
            throw new QlooError("missing", 404, "/search");
          },
        },
        { name: "good", run: async () => ["ok"] },
      ],
      (v) => v.length === 0,
    );
    expect(outcome.strategy).toBe("good");
    expect(outcome.attempts).toEqual(["bad: error 400", "missing: error 404", "good: results"]);
  });

  it("does not move past auth, quota or outage errors", async () => {
    let reached = false;
    await expect(
      firstUsable(
        [
          {
            name: "auth",
            run: async () => {
              throw new QlooError("nope", 401, "/search");
            },
          },
          {
            name: "later",
            run: async () => {
              reached = true;
              return ["x"];
            },
          },
        ],
        (v) => v.length === 0,
      ),
    ).rejects.toThrow("nope");
    expect(reached).toBe(false);
  });

  it("returns the last empty result when nothing had results", async () => {
    const outcome = await firstUsable([{ name: "only", run: async () => [] as string[] }], (v) => v.length === 0);
    expect(outcome).toEqual({ value: [], strategy: "only", attempts: ["only: no results"] });
  });

  it("throws the last error when every strategy errored", async () => {
    await expect(
      firstUsable(
        [
          {
            name: "gone",
            run: async () => {
              throw new QlooError("gone", 404, "/search");
            },
          },
        ],
        () => true,
      ),
    ).rejects.toThrow("gone");
  });
});

describe("find_local_places fallback chain (mocked transport)", () => {
  beforeEach(() => clearQlooCache());

  it("searches around the locality's coordinates when they return places", async () => {
    const transport = scriptedTransport(
      placeHandler((params) => (params["filter.location"] === POINT ? searchOk([PLACE_A, PLACE_B]) : NO_RESULTS)),
    );
    const ctx = makeContext(transport);
    await callTool(ctx, tools, "resolve_city", { city: "Asheville, NC" });
    const outcome = await callTool(ctx, tools, "find_local_places", { query: "live music bar" });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.content).toMatchObject({ strategy: "locality-point", attempts: ["locality-point: results"] });
      expect(outcome.summary).toBe("2 places near Asheville via locality-point");
    }
    const placeCalls = transport.calls.filter((c) => c.params.types === "urn:entity:place");
    expect(placeCalls).toHaveLength(1);
    expect(placeCalls[0].params).toMatchObject({ "filter.location": POINT, "filter.radius": "10" });
    expect(ctx.placeIds).toEqual(["place-gilded", "place-record"]);
  });

  it("never sends the locality id or a geocode filter to /search", async () => {
    const transport = scriptedTransport(placeHandler(() => NO_RESULTS));
    const ctx = makeContext(transport);
    await callTool(ctx, tools, "resolve_city", { city: "Asheville, NC" });
    await callTool(ctx, tools, "find_local_places", { query: "live music bar" });

    const searches = transport.calls.filter((c) => c.path === "/search");
    expect(searches.some((c) => c.params["filter.location"] === "loc-asheville")).toBe(false);
    expect(searches.some((c) => Object.keys(c.params).some((key) => key.startsWith("filter.geocode")))).toBe(false);
  });

  it("falls back to a text search and keeps only places whose address names the city", async () => {
    const transport = scriptedTransport(
      placeHandler((params) =>
        params.query === "live music bar Asheville, NC" ? searchOk([PLACE_ELSEWHERE, PLACE_A]) : NO_RESULTS,
      ),
    );
    const ctx = makeContext(transport);
    await callTool(ctx, tools, "resolve_city", { city: "Asheville, NC" });
    const outcome = await callTool(ctx, tools, "find_local_places", { query: "live music bar" });

    expect(outcome.ok && outcome.content).toMatchObject({
      strategy: "text-search",
      attempts: ["locality-point: no results", "text-search: results"],
    });
    expect(outcome.ok && outcome.summary).toMatch(/via text-search after locality-point: no results/);
    expect(ctx.placeIds).toEqual(["place-gilded"]);
    expect(ctx.knows("place-texas")).toBe(false);
  });

  it("falls past a 400 from the coordinate search", async () => {
    const transport = scriptedTransport(
      placeHandler((params) => {
        if (params["filter.location"]) return BAD_PARAMS;
        return params.query === "Asheville" ? searchOk([PLACE_B]) : searchOk([PLACE_ELSEWHERE]);
      }),
    );
    const ctx = makeContext(transport);
    await callTool(ctx, tools, "resolve_city", { city: "Asheville, NC" });
    const outcome = await callTool(ctx, tools, "find_local_places", { query: "record store" });

    expect(outcome.ok && outcome.content).toMatchObject({
      strategy: "city-search",
      attempts: ["locality-point: error 400", "text-search: no results", "city-search: results"],
    });
  });

  it("skips the coordinate search when resolve_city never found a locality, then remembers a point from a local place", async () => {
    const transport = scriptedTransport(
      placeHandler((params) => (params.query === "live music bar Asheville, NC" ? searchOk([PLACE_B]) : NO_RESULTS)),
    );
    const ctx = makeContext(transport);
    const outcome = await callTool(ctx, tools, "find_local_places", { query: "live music bar" });

    expect(outcome.ok && outcome.content).toMatchObject({ strategy: "text-search" });
    expect(transport.calls.some((c) => c.params["filter.location"] !== undefined)).toBe(false);
    expect(ctx.localityPoint).toEqual({ lat: 35.58, lon: -82.59 });
  });

  it("reports no places, with every attempt, when all strategies come back empty", async () => {
    const transport = scriptedTransport(placeHandler(() => searchOk([PLACE_ELSEWHERE])));
    const ctx = makeContext(transport);
    const outcome = await callTool(ctx, tools, "find_local_places", { query: "live music bar" });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.content).toMatchObject({ strategy: null, places: [] });
      expect(outcome.summary).toBe("No places found near Asheville, NC; tried text-search: no results; city-search: no results");
    }
    expect(ctx.placeIds).toEqual([]);
  });

  it("does not fall back on an auth error", async () => {
    const transport = scriptedTransport(placeHandler(() => UNAUTHORIZED));
    const ctx = makeContext(transport);
    await callTool(ctx, tools, "resolve_city", { city: "Asheville, NC" });
    const before = transport.calls.length;
    await expect(callTool(ctx, tools, "find_local_places", { query: "live music bar" })).rejects.toThrow(/401/);
    expect(transport.calls.length - before).toBe(1);
  });

  it("works for the promo agent too", async () => {
    const transport = scriptedTransport(placeHandler((params) => (params.query === "Asheville" ? searchOk([PLACE_A]) : NO_RESULTS)));
    const ctx = makeContext(transport);
    const outcome = await callTool(ctx, promo, "find_local_places", { query: "live music bar" });
    expect(outcome.ok && outcome.content).toMatchObject({ strategy: "city-search" });
  });
});

describe("get_insights local_only fallback (mocked transport)", () => {
  beforeEach(() => clearQlooCache());

  it("filters place insights by the locality id", async () => {
    const transport = scriptedTransport(placeHandler(() => insightsOk([INSIGHT_PLACE])));
    const ctx = makeContext(transport);
    await callTool(ctx, tools, "resolve_city", { city: "Asheville, NC" });
    const outcome = await callTool(ctx, tools, "get_insights", { entity_kind: "place", local_only: true });

    expect(outcome.ok && outcome.content).toMatchObject({ strategy: "locality-id", attempts: ["locality-id: results"] });
    const insights = transport.calls.filter((c) => c.path === "/v2/insights");
    expect(insights).toHaveLength(1);
    expect(insights[0].params["filter.location"]).toBe("loc-asheville");
  });

  it("retries with the city as a location query after the locality id is empty", async () => {
    const transport = scriptedTransport(
      placeHandler((params) => (params["filter.location.query"] === "Asheville, NC" ? insightsOk([INSIGHT_PLACE]) : insightsOk([]))),
    );
    const ctx = makeContext(transport);
    await callTool(ctx, tools, "resolve_city", { city: "Asheville, NC" });
    const outcome = await callTool(ctx, tools, "get_insights", { entity_kind: "place", local_only: true });

    expect(outcome.ok && outcome.content).toMatchObject({ strategy: "location-query" });
    expect(outcome.ok && outcome.summary).toMatch(/via location-query after locality-id: no results/);
    expect(ctx.insightRuns).toEqual([["place-gilded"]]);
  });

  it("drops location-query places from another town, because Qloo may resolve the text to the wrong locality", async () => {
    const transport = scriptedTransport(placeHandler(() => insightsOk([INSIGHT_ELSEWHERE])));
    const ctx = makeContext(transport, { city: "Hebden Bridge, UK" });
    const outcome = await callTool(ctx, promo, "get_insights", { entity_kind: "place", local_only: true });

    expect(outcome.ok && outcome.content).toMatchObject({ entities: [], attempts: ["location-query: no results"] });
    expect(ctx.knows("place-tipton")).toBe(false);
  });

  it("uses a point taken from a local place when there is no locality", async () => {
    const transport = scriptedTransport(
      placeHandler((params) => {
        if (params.types === "urn:entity:place") return searchOk([PLACE_B]);
        return params["filter.location"] === "POINT(-82.59 35.58)" ? insightsOk([INSIGHT_PLACE]) : insightsOk([]);
      }),
    );
    const ctx = makeContext(transport);
    await callTool(ctx, promo, "find_local_places", { query: "live music bar" });
    const outcome = await callTool(ctx, promo, "get_insights", { entity_kind: "place", local_only: true });

    expect(outcome.ok && outcome.content).toMatchObject({ strategy: "place-point", attempts: ["place-point: results"] });
  });

  it("allows a local-only call with no interest ids", async () => {
    const transport = scriptedTransport(placeHandler(() => insightsOk([INSIGHT_PLACE])));
    const ctx = makeContext(transport);
    const outcome = await callTool(ctx, promo, "get_insights", { entity_kind: "place", local_only: true });
    expect(outcome.ok).toBe(true);
  });
});
