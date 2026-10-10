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

export function fixtureTransport(): QlooTransport {
  return {
    async request(path, params) {
      if (path === "/search") {
        const types = (params.get("types") ?? "").split(",").filter(Boolean);
        const query = params.get("query") ?? "";
        const take = clampTake(params.get("take"), 10);
        if (types.includes(ENTITY_TYPE_URN.locality)) {
          return {
            status: 200,
            body: { success: true, duration: 0.02, _sample: true, results: [toApi(sampleLocalityFor(query))] },
          };
        }
        const pool = types.flatMap((t) => poolForType(t));
        if (pool.length === 0) {
          return { status: 404, body: { code: 404, reason: "Not Found", message: "No results" } };
        }
        const needle = query.trim().toLowerCase();
        const matched = needle ? pool.filter((e) => e.name.toLowerCase().includes(needle)) : [];
        const rest = rankDeterministically(
          pool.filter((e) => !matched.includes(e)),
          `search|${query}|${types.join(",")}`,
        );
        const ranked = [...matched, ...rest];
        const results = ranked.slice(0, take).map(toApi);
        if (results.length === 0) {
          return { status: 404, body: { code: 404, reason: "Not Found", message: "No results" } };
        }
        return { status: 200, body: { success: true, duration: 0.02, _sample: true, results } };
      }

      if (path === "/v2/insights") {
        const type = params.get("filter.type");
        if (!type) {
          return { status: 400, body: { message: "filter.type is required" } };
        }
        const seeds = (params.get("signal.interests.entities") ?? "").split(",").filter(Boolean);
        const location = params.get("filter.location") ?? "";
        const signalLocation = params.get("signal.location.query") ?? "";
        const excluded = new Set((params.get("filter.exclude.entities") ?? "").split(",").filter(Boolean));
        if (seeds.length === 0 && !location && !signalLocation && !params.get("filter.geocode.name")) {
          return { status: 400, body: { message: "at least one valid signal or filter is required" } };
        }
        const take = clampTake(params.get("take"), 20);
        const pool = poolForType(type).filter((e) => !excluded.has(e.id));
        const ranked = rankDeterministically(pool, `insights|${type}|${seeds.join(",")}|${location}|${signalLocation}`);
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
