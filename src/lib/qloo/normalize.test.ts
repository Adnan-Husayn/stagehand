import { describe, expect, it } from "vitest";
import {
  describeResponseShape,
  entitiesFromInsightsBody,
  entitiesFromSearchBody,
  errorMessageFromBody,
  normalizeEntity,
} from "./normalize";

const artistA = { entity_id: "a-1", name: "Artist A", type: "urn:entity:artist", popularity: 0.5 };
const artistB = { entity_id: "a-2", name: "Artist B", type: "urn:entity:artist" };

describe("normalizeEntity", () => {
  it("reads entity_id, then id, for the identifier", () => {
    expect(normalizeEntity({ entity_id: "e-1", id: "other", name: "X" })?.id).toBe("e-1");
    expect(normalizeEntity({ id: "e-2", name: "X" })?.id).toBe("e-2");
  });

  it("drops items without an id or a name rather than inventing one", () => {
    expect(normalizeEntity({ name: "No id" })).toBeNull();
    expect(normalizeEntity({ entity_id: "e-3" })).toBeNull();
    expect(normalizeEntity({ entity_id: "  ", name: "Blank id" })).toBeNull();
    expect(normalizeEntity("not an object")).toBeNull();
  });

  it("defaults type to unknown and leaves optional fields undefined when absent", () => {
    const entity = normalizeEntity({ entity_id: "e-4", name: "Bare" });
    expect(entity).toEqual({ id: "e-4", name: "Bare", type: "unknown" });
    expect(entity?.popularity).toBeUndefined();
    expect(entity?.affinity).toBeUndefined();
    expect(entity?.rating).toBeUndefined();
    expect(entity).not.toHaveProperty("affinity");
  });

  it("takes popularity from the top level, then from properties", () => {
    expect(normalizeEntity({ entity_id: "p", name: "P", popularity: 0.7 })?.popularity).toBe(0.7);
    expect(normalizeEntity({ entity_id: "p", name: "P", properties: { popularity: 0.4 } })?.popularity).toBe(0.4);
    expect(normalizeEntity({ entity_id: "p", name: "P", popularity: 0.9, properties: { popularity: 0.1 } })?.popularity).toBe(0.9);
  });

  it("accepts numeric strings for popularity and ignores other values", () => {
    expect(normalizeEntity({ entity_id: "s", name: "S", popularity: "0.25" })?.popularity).toBe(0.25);
    expect(normalizeEntity({ entity_id: "s", name: "S", popularity: "high" })?.popularity).toBeUndefined();
    expect(normalizeEntity({ entity_id: "s", name: "S", popularity: null })?.popularity).toBeUndefined();
  });

  it("takes affinity from query.affinity, then affinity, then score", () => {
    expect(normalizeEntity({ entity_id: "f", name: "F", query: { affinity: 0.8 }, affinity: 0.1, score: 0.2 })?.affinity).toBe(0.8);
    expect(normalizeEntity({ entity_id: "f", name: "F", affinity: 0.3, score: 0.2 })?.affinity).toBe(0.3);
    expect(normalizeEntity({ entity_id: "f", name: "F", score: 0.2 })?.affinity).toBe(0.2);
  });

  it("reads the kind from subtype when type is only urn:entity", () => {
    const movie = normalizeEntity({ entity_id: "m", name: "Movie", type: "urn:entity", subtype: "urn:entity:movie" });
    expect(movie?.type).toBe("urn:entity:movie");
    expect(movie?.subtype).toBe("urn:entity:movie");
    const plain = normalizeEntity({ entity_id: "i", name: "Indie", type: "urn:entity:artist", subtype: "indie folk" });
    expect(plain?.type).toBe("urn:entity:artist");
    expect(plain?.subtype).toBe("indie folk");
  });
});

describe("response envelopes", () => {
  it("reads search results from a bare results array", () => {
    const body = { success: true, duration: 0.1, results: [artistA, artistB] };
    expect(entitiesFromSearchBody(body).map((e) => e.id)).toEqual(["a-1", "a-2"]);
  });

  it("reads insights results from results.entities and the duration", () => {
    const body = { success: true, results: { entities: [artistA], duration: 0.42 } };
    const parsed = entitiesFromInsightsBody(body);
    expect(parsed.entities.map((e) => e.name)).toEqual(["Artist A"]);
    expect(parsed.durationSec).toBe(0.42);
  });

  it("reads insights results when the array sits directly under results", () => {
    expect(entitiesFromInsightsBody({ results: [artistB] }).entities.map((e) => e.id)).toEqual(["a-2"]);
  });

  it("reads a top-level entities array", () => {
    expect(entitiesFromSearchBody({ entities: [artistA, artistB] }).length).toBe(2);
  });

  it("reads a data array, and data.entities or data.results when data is an object", () => {
    expect(entitiesFromSearchBody({ data: [{ id: "d-1", name: "D1" }] }).map((e) => e.id)).toEqual(["d-1"]);
    expect(entitiesFromSearchBody({ data: { entities: [{ id: "d-2", name: "D2" }] } }).map((e) => e.id)).toEqual(["d-2"]);
    expect(entitiesFromSearchBody({ data: { results: [{ id: "d-3", name: "D3" }] } }).map((e) => e.id)).toEqual(["d-3"]);
  });

  it("reads a bare array body", () => {
    expect(entitiesFromSearchBody([artistA]).map((e) => e.name)).toEqual(["Artist A"]);
  });

  it("prefers results.entities over a sibling entities array", () => {
    const body = { results: { entities: [artistA] }, entities: [artistB] };
    expect(entitiesFromInsightsBody(body).entities.map((e) => e.id)).toEqual(["a-1"]);
  });

  it("returns no entities and a null duration for unknown or empty envelopes", () => {
    expect(entitiesFromSearchBody({ success: true })).toEqual([]);
    expect(entitiesFromSearchBody(null)).toEqual([]);
    expect(entitiesFromSearchBody("oops")).toEqual([]);
    expect(entitiesFromInsightsBody({ results: { entities: [] } })).toEqual({ entities: [], durationSec: null });
  });

  it("skips malformed items but keeps the valid ones", () => {
    const body = { results: [artistA, null, { name: "no id" }, 42, artistB] };
    expect(entitiesFromSearchBody(body).map((e) => e.id)).toEqual(["a-1", "a-2"]);
  });

  it("maps affinity from items inside an envelope", () => {
    const body = { results: { entities: [{ entity_id: "x", name: "X", query: { affinity: 0.66 } }] } };
    expect(entitiesFromInsightsBody(body).entities[0].affinity).toBe(0.66);
  });
});

describe("describeResponseShape and errorMessageFromBody", () => {
  it("describes keys only, never values", () => {
    const body = {
      success: true,
      secret: "sk-should-not-appear",
      results: { entities: [{ entity_id: "v-1", name: "Private Name", query: { affinity: 0.5 } }], duration: 0.2 },
    };
    const shape = describeResponseShape(body);
    expect(shape).not.toContain("sk-should-not-appear");
    expect(shape).not.toContain("Private Name");
    expect(JSON.parse(shape)).toMatchObject({
      topLevelKeys: ["success", "secret", "results"],
      resultsKeys: ["entities", "duration"],
      entitiesAt: "results.entities",
      entityCount: 1,
      firstItemKeys: ["entity_id", "name", "query"],
      firstItemNestedKeys: { query: ["affinity"] },
    });
  });

  it("reports no entities for an error body", () => {
    expect(JSON.parse(describeResponseShape({ code: 404, message: "No results" }))).toMatchObject({
      entitiesAt: null,
      entityCount: 0,
      firstItemKeys: null,
    });
  });

  it("extracts message or reason from an error body", () => {
    expect(errorMessageFromBody({ message: "bad filter" })).toBe("bad filter");
    expect(errorMessageFromBody({ reason: "Not Found" })).toBe("Not Found");
    expect(errorMessageFromBody(undefined)).toBeUndefined();
  });
});
