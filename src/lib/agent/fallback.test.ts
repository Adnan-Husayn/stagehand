import { beforeEach, describe, expect, it } from "vitest";
import { clearQlooCache, QlooError } from "../qloo/client";
import { firstUsable, geocodeCandidates } from "./fallback";
import { promoTools, shortlistTools } from "./tools";
import {
  callTool,
  insightsOk,
  makeContext,
  rawEntity,
  scriptedTransport,
  searchOk,
  type Handler,
  type Reply,
} from "@/test/helpers";

const LOCALITY = rawEntity("loc-asheville", "Asheville", "urn:entity:locality");
const PLACE_A = rawEntity("place-gilded", "The Gilded Tap", "urn:entity:place");
const PLACE_B = rawEntity("place-record", "Corner Record Bar", "urn:entity:place");
const NO_RESULTS: Reply = { status: 404, body: { code: 404, reason: "Not Found", message: "No results" } };
const BAD_PARAMS: Reply = { status: 400, body: { message: "bad filter" } };
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

describe("geocodeCandidates", () => {
  it("tries the region first and the bare city name second for 'City, ST'", () => {
    expect(geocodeCandidates("Asheville, NC")).toEqual([
      { name: "geocode-name+region", filter: { name: "Asheville", admin1Region: "NC" } },
      { name: "geocode-name", filter: { name: "Asheville" } },
    ]);
  });

  it("uses only the city name when no region is given", () => {
    expect(geocodeCandidates("Nashville")).toEqual([{ name: "geocode-name", filter: { name: "Nashville" } }]);
  });

  it("keeps a two-letter third part as a country code", () => {
    expect(geocodeCandidates("Lyon, Auvergne, fr")[0].filter).toEqual({
      name: "Lyon",
      admin1Region: "Auvergne",
      countryCode: "FR",
    });
  });

  it("returns nothing for a blank city", () => {
    expect(geocodeCandidates(" , ")).toEqual([]);
  });
});

describe("find_local_places fallback chain (mocked transport)", () => {
  beforeEach(() => clearQlooCache());

  it("uses the locality id when it returns places", async () => {
    const transport = scriptedTransport(
      placeHandler((params) => (params["filter.location"] === "loc-asheville" ? searchOk([PLACE_A, PLACE_B]) : NO_RESULTS)),
    );
    const ctx = makeContext(transport);
    await callTool(ctx, tools, "resolve_city", { city: "Asheville, NC" });
    const outcome = await callTool(ctx, tools, "find_local_places", { query: "live music bar" });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.content).toMatchObject({ strategy: "locality-id", attempts: ["locality-id: results"] });
      expect(outcome.summary).toBe("2 places near Asheville via locality-id");
    }
    expect(transport.calls.some((c) => c.params["filter.geocode.name"])).toBe(false);
    expect(ctx.placeIds).toEqual(["place-gilded", "place-record"]);
  });

  it("falls back to the city name with region when the locality id returns nothing", async () => {
    const transport = scriptedTransport(
      placeHandler((params) =>
        params["filter.geocode.name"] === "Asheville" && params["filter.geocode.admin1_region"] === "NC"
          ? searchOk([PLACE_A])
          : NO_RESULTS,
      ),
    );
    const ctx = makeContext(transport);
    await callTool(ctx, tools, "resolve_city", { city: "Asheville, NC" });
    const outcome = await callTool(ctx, tools, "find_local_places", { query: "live music bar" });

    expect(outcome.ok && outcome.content).toMatchObject({
      strategy: "geocode-name+region",
      attempts: ["locality-id: no results", "geocode-name+region: results"],
    });
    const geo = transport.calls.find((c) => c.params["filter.geocode.name"] === "Asheville");
    expect(geo?.params["filter.geocode.admin1_region"]).toBe("NC");
  });

  it("falls past a 400 from the locality id and then to the bare city name", async () => {
    const transport = scriptedTransport(
      placeHandler((params) => {
        if (params["filter.location"]) return BAD_PARAMS;
        if (params["filter.geocode.admin1_region"]) return NO_RESULTS;
        return searchOk([PLACE_B]);
      }),
    );
    const ctx = makeContext(transport);
    await callTool(ctx, tools, "resolve_city", { city: "Asheville, NC" });
    const outcome = await callTool(ctx, tools, "find_local_places", { query: "record store" });

    expect(outcome.ok && outcome.content).toMatchObject({
      strategy: "geocode-name",
      attempts: ["locality-id: error 400", "geocode-name+region: no results", "geocode-name: results"],
    });
  });

  it("skips the locality id when resolve_city never found one", async () => {
    const transport = scriptedTransport(
      placeHandler((params) =>
        params["filter.geocode.name"] === "Asheville" && !params["filter.geocode.admin1_region"] ? searchOk([PLACE_A]) : NO_RESULTS,
      ),
    );
    const ctx = makeContext(transport);
    const outcome = await callTool(ctx, tools, "find_local_places", { query: "live music bar" });

    expect(outcome.ok && outcome.content).toMatchObject({ strategy: "geocode-name" });
    expect(transport.calls.some((c) => c.params["filter.location"] !== undefined)).toBe(false);
  });

  it("reaches the text search last and labels it", async () => {
    const transport = scriptedTransport(
      placeHandler((params) => (params.query === "live music bar Asheville, NC" ? searchOk([PLACE_A]) : NOT_FOUND_PATH)),
    );
    const ctx = makeContext(transport);
    await callTool(ctx, tools, "resolve_city", { city: "Asheville, NC" });
    const outcome = await callTool(ctx, tools, "find_local_places", { query: "live music bar" });

    expect(outcome.ok && outcome.content).toMatchObject({ strategy: "text-search" });
    expect(outcome.ok && outcome.summary).toMatch(/via text-search after/);
  });

  it("reports no places, with every attempt, when all strategies come back empty", async () => {
    const transport = scriptedTransport(placeHandler(() => NO_RESULTS));
    const ctx = makeContext(transport);
    await callTool(ctx, tools, "resolve_city", { city: "Asheville, NC" });
    const outcome = await callTool(ctx, tools, "find_local_places", { query: "live music bar" });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.content).toMatchObject({ strategy: null, places: [] });
      expect(outcome.summary).toMatch(/^No places found near Asheville; tried locality-id: no results/);
    }
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
    const transport = scriptedTransport(placeHandler((params) => (params["filter.geocode.name"] ? searchOk([PLACE_A]) : NO_RESULTS)));
    const ctx = makeContext(transport);
    const outcome = await callTool(ctx, promo, "find_local_places", { query: "live music bar" });
    expect(outcome.ok && outcome.content).toMatchObject({ strategy: "geocode-name+region" });
  });
});

describe("get_insights local_only fallback (mocked transport)", () => {
  beforeEach(() => clearQlooCache());

  it("retries a local place insights call with the geocode filter after the locality id is empty", async () => {
    const transport = scriptedTransport(
      placeHandler((params) => {
        if (params["filter.type"] !== "urn:entity:place") return insightsOk([]);
        return params["filter.geocode.name"] ? insightsOk([PLACE_A]) : insightsOk([]);
      }),
    );
    const ctx = makeContext(transport);
    await callTool(ctx, tools, "resolve_city", { city: "Asheville, NC" });
    const outcome = await callTool(ctx, tools, "get_insights", { entity_kind: "place", local_only: true });

    expect(outcome.ok && outcome.content).toMatchObject({ strategy: "geocode-name+region" });
    expect(outcome.ok && outcome.summary).toMatch(/via geocode-name\+region after locality-id: no results/);
    expect(ctx.insightRuns).toEqual([["place-gilded"]]);
  });

  it("allows a local-only call with no interest ids when a geocode fallback exists", async () => {
    const transport = scriptedTransport(placeHandler(() => insightsOk([PLACE_B])));
    const ctx = makeContext(transport);
    const outcome = await callTool(ctx, promo, "get_insights", { entity_kind: "place", local_only: true });
    expect(outcome.ok).toBe(true);
  });
});
