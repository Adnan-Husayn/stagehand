import { describe, expect, it } from "vitest";
import { ENTITY_TYPE_URN } from "../qloo/types";
import { fixtureTransport } from "./fixture-transport";

async function call(path: string, query: Record<string, string>) {
  const transport = fixtureTransport();
  return transport.request(path, new URLSearchParams(query));
}

interface Item {
  entity_id: string;
  name: string;
  type: string;
}

function searchItems(body: unknown): Item[] {
  return (body as { results: Item[] }).results;
}

function insightItems(body: unknown): Item[] {
  return (body as { results: { entities: Item[] } }).results.entities;
}

const KINDS = ["artist", "place", "brand", "podcast", "movie", "tv_show"] as const;

describe("fixture transport: /search", () => {
  it("answers every entity kind the app supports with sample-labelled ids of that kind", async () => {
    for (const kind of KINDS) {
      const res = await call("/search", { query: "anything at all", types: ENTITY_TYPE_URN[kind], take: "5" });
      expect(res.status).toBe(200);
      const items = searchItems(res.body);
      expect(items.length).toBe(5);
      for (const item of items) {
        expect(item.entity_id.startsWith("sample-")).toBe(true);
        expect(item.type).toBe(ENTITY_TYPE_URN[kind]);
      }
      expect((res.body as { _sample: boolean })._sample).toBe(true);
    }
  });

  it("includes TV shows", async () => {
    const res = await call("/search", { query: "Harbor Lights", types: ENTITY_TYPE_URN.tv_show });
    expect(searchItems(res.body)[0].name).toBe("Harbor Lights");
  });

  it("finds a seed artist when the query has extra words or different case", async () => {
    for (const query of ["Velvet Anchor", "velvet anchor", "Velvet Anchor indie band", "the artist Velvet Anchor"]) {
      const res = await call("/search", { query, types: ENTITY_TYPE_URN.artist, take: "3" });
      expect(searchItems(res.body)[0].name).toBe("Velvet Anchor");
    }
  });

  it("returns sample artists for a name it does not hold, instead of a 404", async () => {
    const res = await call("/search", { query: "Nobody In Particular", types: ENTITY_TYPE_URN.artist });
    expect(res.status).toBe(200);
    expect(searchItems(res.body).length).toBeGreaterThan(0);
  });

  it("accepts short type names, several types at once, and location parameters", async () => {
    const short = await call("/search", { query: "Salt Road", types: "movie" });
    expect(searchItems(short.body)[0].name).toBe("Salt Road");
    const mixed = await call("/search", { query: "x", types: `${ENTITY_TYPE_URN.brand},${ENTITY_TYPE_URN.podcast}`, take: "50" });
    expect(new Set(searchItems(mixed.body).map((i) => i.type))).toEqual(
      new Set([ENTITY_TYPE_URN.brand, ENTITY_TYPE_URN.podcast]),
    );
    const located = await call("/search", {
      query: "record store",
      types: ENTITY_TYPE_URN.place,
      "filter.geocode.name": "Asheville",
      "filter.geocode.admin1_region": "NC",
      "filter.radius": "10",
    });
    expect(located.status).toBe(200);
  });

  it("resolves any city name to a sample locality", async () => {
    const res = await call("/search", { query: "Asheville, NC", types: ENTITY_TYPE_URN.locality });
    expect(searchItems(res.body)[0]).toMatchObject({ entity_id: "sample-locality-asheville-nc", type: ENTITY_TYPE_URN.locality });
    const other = await call("/search", { query: "Duluth", types: ENTITY_TYPE_URN.locality });
    expect(searchItems(other.body)[0].entity_id).toBe("sample-locality-duluth");
  });

  it("is deterministic and honours take", async () => {
    const params = { query: "some query", types: ENTITY_TYPE_URN.artist, take: "4" };
    const a = await call("/search", params);
    const b = await call("/search", params);
    expect(a.body).toEqual(b.body);
    expect(searchItems(a.body)).toHaveLength(4);
  });

  it("still rejects malformed calls like the real API", async () => {
    expect((await call("/search", { query: "", types: ENTITY_TYPE_URN.artist })).status).toBe(400);
    expect((await call("/search", { query: "x", types: "urn:entity:person" })).status).toBe(404);
  });
});

describe("fixture transport: /v2/insights", () => {
  it("answers every supported kind for an artist signal", async () => {
    for (const kind of KINDS) {
      const res = await call("/v2/insights", {
        "filter.type": ENTITY_TYPE_URN[kind],
        "signal.interests.entities": "sample-artist-the-larkspur-hour",
        take: "6",
      });
      expect(res.status).toBe(200);
      const items = insightItems(res.body);
      expect(items.length).toBe(6);
      expect(items.every((i) => i.entity_id.startsWith("sample-") && i.type === ENTITY_TYPE_URN[kind])).toBe(true);
    }
  });

  it("accepts any parameter combination that carries a signal or a location", async () => {
    const combos: Record<string, string>[] = [
      { "signal.interests.entities": "sample-place-the-gilded-tap,sample-place-marrow-kitchen" },
      { "filter.location": "sample-locality-asheville-nc" },
      { "filter.geocode.name": "Asheville", "filter.geocode.admin1_region": "NC" },
      { "signal.location.query": "Asheville, NC" },
      { "signal.interests.entities": "sample-artist-copper-tennis", "filter.location": "sample-locality-asheville-nc" },
    ];
    for (const extra of combos) {
      const res = await call("/v2/insights", { "filter.type": ENTITY_TYPE_URN.artist, ...extra });
      expect(res.status).toBe(200);
      expect(insightItems(res.body).length).toBeGreaterThan(0);
    }
  });

  it("gives different signals different orderings, and the same call the same answer", async () => {
    const base = { "filter.type": ENTITY_TYPE_URN.brand };
    const a1 = await call("/v2/insights", { ...base, "signal.interests.entities": "sample-artist-a" });
    const a2 = await call("/v2/insights", { ...base, "signal.interests.entities": "sample-artist-a" });
    const b = await call("/v2/insights", { ...base, "signal.interests.entities": "sample-artist-b" });
    expect(a1.body).toEqual(a2.body);
    expect(insightItems(a1.body).map((i) => i.entity_id)).not.toEqual(insightItems(b.body).map((i) => i.entity_id));
  });

  it("drops excluded ids", async () => {
    const res = await call("/v2/insights", {
      "filter.type": ENTITY_TYPE_URN.artist,
      "signal.interests.entities": "sample-place-the-gilded-tap",
      "filter.exclude.entities": "sample-artist-velvet-anchor,sample-artist-night-ferry",
      take: "50",
    });
    const ids = insightItems(res.body).map((i) => i.entity_id);
    expect(ids).not.toContain("sample-artist-velvet-anchor");
    expect(ids).not.toContain("sample-artist-night-ferry");
  });

  it("keeps the documented 400s for calls with no signal or an invalid type", async () => {
    expect((await call("/v2/insights", { "filter.type": ENTITY_TYPE_URN.artist })).status).toBe(400);
    expect((await call("/v2/insights", { "signal.interests.entities": "x" })).status).toBe(400);
    expect((await call("/v2/insights", { "filter.type": "urn:entity:spaceship", "signal.interests.entities": "x" })).status).toBe(400);
  });

  it("returns an empty list, not an error, for documented types it holds no records for", async () => {
    const res = await call("/v2/insights", { "filter.type": "urn:entity:book", "signal.interests.entities": "x" });
    expect(res.status).toBe(200);
    expect(insightItems(res.body)).toEqual([]);
  });
});
