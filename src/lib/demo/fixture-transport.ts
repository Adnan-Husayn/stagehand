// Demo transport: answers the same paths and parameters as the live API, using sample fixtures.
// Ordering is a deterministic hash of the request, so repeated demo runs are stable.
import { ENTITY_TYPE_URN } from "../qloo/types";
import type { QlooTransport } from "../qloo/client";
import { poolForType, sampleLocalityFor, type FixtureEntity } from "./fixtures";

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function rankDeterministically(pool: FixtureEntity[], seed: string): FixtureEntity[] {
  return [...pool].sort((a, b) => fnv1a(seed + a.id) - fnv1a(seed + b.id));
}

function toApi(entity: FixtureEntity) {
  return {
    entity_id: entity.id,
    name: entity.name,
    type: entity.type,
    ...(entity.subtype ? { subtype: entity.subtype } : {}),
    popularity: entity.popularity,
    ...(entity.rating !== undefined ? { rating: entity.rating } : {}),
  };
}

function clampTake(raw: string | null, fallback: number): number {
  const n = raw === null ? fallback : Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(50, Math.max(1, n)) : fallback;
}

/** Entity kinds the app supports, plus the long-form URNs the client sends. */
const SHORT_TYPES: Record<string, string> = {
  artist: ENTITY_TYPE_URN.artist,
  place: ENTITY_TYPE_URN.place,
  brand: ENTITY_TYPE_URN.brand,
  podcast: ENTITY_TYPE_URN.podcast,
  movie: ENTITY_TYPE_URN.movie,
  tv_show: ENTITY_TYPE_URN.tv_show,
  locality: ENTITY_TYPE_URN.locality,
};

/** Types Qloo documents for filter.type that Stagehand does not use. The fixtures hold no records for them. */
const OTHER_DOCUMENTED_TYPES = new Set(["book", "destination", "person", "video_game"]);

function normaliseType(raw: string): string {
  const trimmed = raw.trim();
  const short = trimmed.replace(/^urn:entity:/, "");
  return SHORT_TYPES[short] ?? trimmed;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Orders a pool for a search query. Names that contain the whole query come first (the scripted
 * demo relies on this). Then names whose every word appears in the query, so a model that searches
 * "Velvet Anchor indie band" still finds "Velvet Anchor". The rest follow in a stable pseudo-random order.
 */
function orderForSearch(pool: FixtureEntity[], query: string, types: string[]): FixtureEntity[] {
  const needle = query.trim().toLowerCase();
  const substring = needle ? pool.filter((e) => e.name.toLowerCase().includes(needle)) : [];
  const queryWords = new Set(words(query));
  const wordMatch = pool.filter((e) => {
    if (substring.includes(e)) return false;
    const nameWords = words(e.name);
    return nameWords.length > 0 && nameWords.every((w) => queryWords.has(w));
  });
  const used = new Set([...substring, ...wordMatch]);
  const rest = rankDeterministically(
    pool.filter((e) => !used.has(e)),
    `search|${query}|${types.join(",")}`,
  );
  return [...substring, ...wordMatch, ...rest];
}

function listParam(params: URLSearchParams, key: string): string[] {
  return (params.get(key) ?? "").split(",").map((v) => v.trim()).filter(Boolean);
}

/**
 * Sample-data stand-in for the Qloo API. It answers any well-formed /search or /v2/insights call for
 * the entity kinds Stagehand uses, so a real model can be tested against it. Results are fictional,
 * deterministic for a given request, and every id starts with "sample-". It does not enforce
 * grounding: the tools and validators do that.
 */
export function fixtureTransport(): QlooTransport {
  return {
    async request(path, params) {
      if (path === "/search") {
        const rawTypes = listParam(params, "types");
        const types = rawTypes.map(normaliseType);
        const query = params.get("query") ?? "";
        if (query.trim() === "") {
          return { status: 400, body: { message: "query is required" } };
        }
        const take = clampTake(params.get("take"), 10);
        if (types.includes(ENTITY_TYPE_URN.locality)) {
          return {
            status: 200,
            body: { success: true, duration: 0.02, _sample: true, results: [toApi(sampleLocalityFor(query))] },
          };
        }
        const pool = types.flatMap((t) => poolForType(t));
        const results = orderForSearch(pool, query, types).slice(0, take).map(toApi);
        if (results.length === 0) {
          return { status: 404, body: { code: 404, reason: "Not Found", message: "No results" } };
        }
        return { status: 200, body: { success: true, duration: 0.02, _sample: true, results } };
      }

      if (path === "/v2/insights") {
        const rawType = params.get("filter.type");
        if (!rawType) {
          return { status: 400, body: { message: "filter.type is required" } };
        }
        const type = normaliseType(rawType);
        const known = poolForType(type).length > 0;
        if (!known && !OTHER_DOCUMENTED_TYPES.has(rawType.replace(/^urn:entity:/, ""))) {
          return { status: 400, body: { message: `filter.type "${rawType}" is not a valid entity type` } };
        }
        const seeds = listParam(params, "signal.interests.entities");
        const location = params.get("filter.location") ?? "";
        const signalLocation = params.get("signal.location.query") ?? "";
        const geocode = params.get("filter.geocode.name") ?? "";
        if (seeds.length === 0 && !location && !signalLocation && !geocode) {
          return { status: 400, body: { message: "at least one valid signal or filter is required" } };
        }
        const take = clampTake(params.get("take"), 20);
        const excluded = new Set(listParam(params, "filter.exclude.entities"));
        const pool = poolForType(type).filter((e) => !excluded.has(e.id));
        const ranked = rankDeterministically(
          pool,
          `insights|${type}|${seeds.join(",")}|${location}|${signalLocation}|${geocode}`,
        );
        return {
          status: 200,
          body: {
            success: true,
            _sample: true,
            results: { entities: ranked.slice(0, take).map(toApi), duration: 0.03 },
          },
        };
      }

      return { status: 404, body: { message: "No path matching request parameters" } };
    },
  };
}
