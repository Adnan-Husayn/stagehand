import type { NormalizedEntity } from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** Accepts finite numbers and numeric strings. Anything else is undefined, never a default. */
function asNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Finds the array of entity objects in a Qloo response body. The live envelope is not yet
 * verified (see docs/QLOO_NOTES.md), so several plausible shapes are checked in order.
 * Returns null when no array is found.
 */
export function locateEntities(body: unknown): { path: string; items: unknown[] } | null {
  if (Array.isArray(body)) return { path: "(root array)", items: body };
  if (!isObject(body)) return null;
  const { results, entities, data } = body;
  if (isObject(results) && Array.isArray(results.entities)) return { path: "results.entities", items: results.entities };
  if (Array.isArray(results)) return { path: "results", items: results };
  if (Array.isArray(entities)) return { path: "entities", items: entities };
  if (Array.isArray(data)) return { path: "data", items: data };
  if (isObject(data) && Array.isArray(data.entities)) return { path: "data.entities", items: data.entities };
  if (isObject(data) && Array.isArray(data.results)) return { path: "data.results", items: data.results };
  return null;
}

/**
 * Converts one raw entity object into the fields this app uses.
 * Only fields that are actually present are copied; nothing is invented.
 * Items without an id or a name are dropped, because they cannot be shown or cited.
 */
export function normalizeEntity(raw: unknown): NormalizedEntity | null {
  if (!isObject(raw)) return null;
  const id = asString(raw.entity_id) ?? asString(raw.id);
  const name = asString(raw.name);
  if (!id || !name) return null;
  // Insights items carry type "urn:entity" and the specific kind in subtype (for example "urn:entity:movie").
  const rawType = asString(raw.type);
  const subtype = asString(raw.subtype);
  const kind =
    rawType && rawType !== "urn:entity"
      ? rawType
      : subtype?.startsWith("urn:entity:")
        ? subtype
        : rawType;
  const entity: NormalizedEntity = {
    id,
    name,
    type: kind ?? "unknown",
  };
  if (subtype) entity.subtype = subtype;

  const properties = isObject(raw.properties) ? raw.properties : {};
  const popularity = asNumber(raw.popularity) ?? asNumber(properties.popularity);
  if (popularity !== undefined) entity.popularity = popularity;

  const rating = asNumber(raw.rating);
  if (rating !== undefined) entity.rating = rating;

  const query = isObject(raw.query) ? raw.query : {};
  const affinity = asNumber(query.affinity) ?? asNumber(raw.affinity) ?? asNumber(raw.score);
  if (affinity !== undefined) entity.affinity = affinity;

  return entity;
}

/** Every entity in a body, whichever envelope it uses. */
export function entitiesFromBody(body: unknown): NormalizedEntity[] {
  const located = locateEntities(body);
  if (!located) return [];
  return located.items.map(normalizeEntity).filter((e): e is NormalizedEntity => e !== null);
}

/** /search returns { success, duration, results: [...] }. */
export function entitiesFromSearchBody(body: unknown): NormalizedEntity[] {
  return entitiesFromBody(body);
}

/** /v2/insights returns { success, results: { entities: [...], duration } }. */
export function entitiesFromInsightsBody(body: unknown): { entities: NormalizedEntity[]; durationSec: number | null } {
  const duration = isObject(body)
    ? (asNumber(isObject(body.results) ? body.results.duration : undefined) ?? asNumber(body.duration))
    : undefined;
  return { entities: entitiesFromBody(body), durationSec: duration ?? null };
}

export function errorMessageFromBody(body: unknown): string | undefined {
  if (!isObject(body)) return undefined;
  return asString(body.message) ?? asString(body.reason);
}

/**
 * Describes the shape of a response using key names only, never values, so it is safe to log.
 * Used by DEBUG_QLOO to show the real envelope on a first live run.
 */
export function describeResponseShape(body: unknown): string {
  const topLevelKeys = isObject(body) ? Object.keys(body) : [Array.isArray(body) ? "(array)" : typeof body];
  const located = locateEntities(body);
  const first = located?.items[0];
  let firstItemKeys: string[] | null = null;
  let nestedKeys: Record<string, string[]> | undefined;
  if (isObject(first)) {
    firstItemKeys = Object.keys(first);
    nestedKeys = {};
    for (const [key, value] of Object.entries(first)) {
      if (isObject(value)) nestedKeys[key] = Object.keys(value);
    }
  }
  return JSON.stringify({
    topLevelKeys,
    resultsKeys: isObject(body) && isObject(body.results) ? Object.keys(body.results) : null,
    entitiesAt: located?.path ?? null,
    entityCount: located?.items.length ?? 0,
    firstItemKeys,
    firstItemNestedKeys: nestedKeys && Object.keys(nestedKeys).length > 0 ? nestedKeys : null,
  });
}
