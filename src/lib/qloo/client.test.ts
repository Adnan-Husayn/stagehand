import { beforeEach, describe, expect, it } from "vitest";
import { clearQlooCache, createQlooClient, liveTransport, QlooError } from "./client";
import { scriptedTransport } from "@/test/helpers";
import {
  INSIGHTS_BAD_SIGNAL,
  insightItem,
  insightPlace,
  liveInsightsBody,
  liveSearchBody,
  localityItem,
  SEARCH_BAD_LOCATION,
  searchItem,
} from "@/test/live-shapes";

describe("Qloo client against live-shaped replies", () => {
  beforeEach(() => clearQlooCache());

  it("reads search results and sends coordinates in filter.location", async () => {
    const transport = scriptedTransport(() => ({
      status: 200,
      body: liveSearchBody([searchItem("a-1", "Some Band", "artist", { popularity: 0.98 })]),
    }));
    const client = createQlooClient(transport, "live");
    const found = await client.search({
      query: "live music bar",
      types: ["urn:entity:place"],
      take: 5,
      filterLocation: "35.57,-82.55",
      filterRadiusMiles: 10,
    });

    expect(found).toEqual([
      { id: "a-1", name: "Some Band", type: "urn:entity:artist", popularity: 0.98, disambiguation: "Some Band" },
    ]);
    expect(transport.calls[0]).toEqual({
      path: "/search",
      params: { query: "live music bar", types: "urn:entity:place", "filter.location": "35.57,-82.55", "filter.radius": "10", take: "5" },
    });
  });

  it("treats 200 with an empty array as no results", async () => {
    const client = createQlooClient(scriptedTransport(() => ({ status: 200, body: liveSearchBody([]) })), "live");
    expect(await client.search({ query: "zzqxjvkwpqy", types: ["urn:entity:artist"] })).toEqual([]);
  });

  it("puts the nested /search error message into the thrown error", async () => {
    const client = createQlooClient(scriptedTransport(() => ({ status: 400, body: SEARCH_BAD_LOCATION })), "live");
    const err = await client
      .search({ query: "bar", types: ["urn:entity:place"], filterLocation: "not-a-point" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QlooError);
    expect((err as QlooError).status).toBe(400);
    expect((err as QlooError).message).toMatch(/must be in the form lat,lon/);
  });

  it("puts the /v2/insights errors array message into the thrown error", async () => {
    const client = createQlooClient(scriptedTransport(() => ({ status: 400, body: INSIGHTS_BAD_SIGNAL })), "live");
    await expect(client.insights({ filterType: "urn:entity:artist", interestEntityIds: ["nope"] })).rejects.toThrow(
      /All of the provided signal\.interests\.entities were invalid/,
    );
  });

  it("reads insights entities, affinity and place ratings, with no duration in the body", async () => {
    const transport = scriptedTransport(() => ({
      status: 200,
      body: liveInsightsBody([
        insightItem("a-2", "Other Band", "artist", 0.96),
        insightPlace("p-1", "Static Records", "110 N Lexington Ave Asheville, NC 28801", null),
      ]),
    }));
    const client = createQlooClient(transport, "live");
    const out = await client.insights({
      filterType: "urn:entity:artist",
      interestEntityIds: ["a-1"],
      excludeEntityIds: ["a-1", "a-9"],
      take: 5,
    });

    expect(out.durationSec).toBeNull();
    expect(out.entities[0]).toMatchObject({ id: "a-2", type: "urn:entity:artist", affinity: 0.96, popularity: 0.97 });
    expect(out.entities[1]).toMatchObject({ id: "p-1", type: "urn:entity:place", rating: 4.6 });
    expect(out.entities[1]).not.toHaveProperty("affinity");
    expect(transport.calls[0].params).toEqual({
      "filter.type": "urn:entity:artist",
      "signal.interests.entities": "a-1",
      "filter.exclude.entities": "a-1,a-9",
      take: "5",
    });
  });

  it("sends a locality id in filter.location and a city in filter.location.query", async () => {
    const transport = scriptedTransport(() => ({ status: 200, body: liveInsightsBody([]) }));
    const client = createQlooClient(transport, "live");
    await client.insights({ filterType: "urn:entity:place", filterLocation: "loc-1" });
    await client.insights({ filterType: "urn:entity:place", filterLocationQuery: "Asheville, NC" });

    expect(transport.calls[0].params["filter.location"]).toBe("loc-1");
    expect(transport.calls[1].params["filter.location.query"]).toBe("Asheville, NC");
    expect(transport.calls.some((c) => Object.keys(c.params).some((key) => key.startsWith("filter.geocode")))).toBe(false);
  });

  it("refuses an insights call with no signal or location before it reaches Qloo", async () => {
    const transport = scriptedTransport(() => ({ status: 200, body: liveInsightsBody([]) }));
    const client = createQlooClient(transport, "live");
    await expect(client.insights({ filterType: "urn:entity:artist" })).rejects.toThrow(/at least one interest entity/);
    expect(transport.calls).toHaveLength(0);
  });

  it("keeps a locality's coordinates and context line", async () => {
    const client = createQlooClient(
      scriptedTransport(() => ({
        status: 200,
        body: liveSearchBody([localityItem("loc-1", "Asheville", "Buncombe, North Carolina, United States of America", 35.57, -82.55)]),
      })),
      "live",
    );
    const [locality] = await client.search({ query: "Asheville, NC", types: ["urn:entity:locality"] });
    expect(locality).toMatchObject({
      type: "urn:entity:locality",
      location: { lat: 35.57, lon: -82.55 },
      disambiguation: "Asheville, Buncombe, North Carolina, United States of America",
    });
  });
});

describe("live transport", () => {
  function fakeFetch(replies: (Response | Error)[]) {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string> });
      const next = replies.shift();
      if (!next) throw new Error("no scripted reply");
      if (next instanceof Error) throw next;
      return next;
    }) as typeof fetch;
    return { impl, seen };
  }
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  const params = new URLSearchParams({ query: "x" });

  it("sends the key in the X-Api-Key header and never in the URL", async () => {
    const { impl, seen } = fakeFetch([json(200, liveSearchBody([]))]);
    const transport = liveTransport("https://hackathon.api.qloo.com/", "secret-key", { fetchImpl: impl });
    const reply = await transport.request("/search", params);

    expect(reply).toEqual({ status: 200, body: { results: [] } });
    expect(seen[0].url).toBe("https://hackathon.api.qloo.com/search?query=x");
    expect(seen[0].headers["X-Api-Key"]).toBe("secret-key");
  });

  it("retries once after a 429 and returns the second reply", async () => {
    const { impl, seen } = fakeFetch([json(429, { message: "API rate limit exceeded" }), json(200, liveSearchBody([]))]);
    const transport = liveTransport("https://example.test", "k", { fetchImpl: impl, retryDelayMs: 0 });
    expect((await transport.request("/search", params)).status).toBe(200);
    expect(seen).toHaveLength(2);
  });

  it("returns the 429 when the retry is limited too", async () => {
    const { impl, seen } = fakeFetch([json(429, {}), json(429, {})]);
    const transport = liveTransport("https://example.test", "k", { fetchImpl: impl, retryDelayMs: 0 });
    expect((await transport.request("/search", params)).status).toBe(429);
    expect(seen).toHaveLength(2);
  });

  it("does not retry other error statuses", async () => {
    const { impl, seen } = fakeFetch([json(400, SEARCH_BAD_LOCATION)]);
    const transport = liveTransport("https://example.test", "k", { fetchImpl: impl, retryDelayMs: 0 });
    expect((await transport.request("/search", params)).status).toBe(400);
    expect(seen).toHaveLength(1);
  });

  it("retries a network failure once, then reports that Qloo could not be reached", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const first = fakeFetch([timeout, json(200, liveSearchBody([]))]);
    const ok = liveTransport("https://example.test", "k", { fetchImpl: first.impl, retryDelayMs: 0 });
    expect((await ok.request("/search", params)).status).toBe(200);

    const second = fakeFetch([timeout, timeout]);
    const down = liveTransport("https://example.test", "k", { fetchImpl: second.impl, retryDelayMs: 0 });
    await expect(down.request("/search", params)).rejects.toThrow(/Could not reach Qloo \(TimeoutError\)/);
  });
});
