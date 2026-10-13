import type { NormalizedEntity } from "./types";
import {
  describeResponseShape,
  entitiesFromInsightsBody,
  entitiesFromSearchBody,
  errorMessageFromBody,
} from "./normalize";

/**
 * Typed Qloo client. The same client runs against the live hackathon API or
 * against labelled demo fixtures, depending on which transport it is given.
 */

export class QlooError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(message: string, status: number, path: string) {
    super(message);
    this.name = "QlooError";
    this.status = status;
    this.path = path;
  }
}

export interface QlooTransport {
  request(path: string, params: URLSearchParams): Promise<{ status: number; body: unknown }>;
}

export interface SearchInput {
  query: string;
  types: string[];
  take?: number;
  /** Coordinates as "lat,lon". /search rejects a locality id here with a 400. */
  filterLocation?: string;
  filterRadiusMiles?: number;
}

export interface InsightsInput {
  filterType: string;
  interestEntityIds?: string[];
  excludeEntityIds?: string[];
  /** A locality id, or a WKT point such as "POINT(-82.55 35.57)". */
  filterLocation?: string;
  /** A place name in plain words. Qloo resolves it to its best-matching locality, which can be the wrong one. */
  filterLocationQuery?: string;
  /** Experimental: natural-language location signal. Not confirmed for artists. */
  signalLocationQuery?: string;
  take?: number;
}

export interface InsightsOutput {
  entities: NormalizedEntity[];
  durationSec: number | null;
  fromCache: boolean;
}

export interface QlooClient {
  readonly mode: "live" | "demo";
  search(input: SearchInput): Promise<NormalizedEntity[]>;
  insights(input: InsightsInput): Promise<InsightsOutput>;
}

export interface QlooClientOptions {
  /** DEBUG_QLOO=1: log response key names (never values or the key) for each fresh response. */
  debug?: boolean;
}

// In-memory cache, per server instance: 10 minutes, bounded size.
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const cache = new Map<string, { expires: number; value: unknown }>();

/** Test helper: empties the response cache. */
export function clearQlooCache(): void {
  cache.clear();
}

function cacheGet(key: string): unknown | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(key: string, value: unknown): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, value });
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function mapHttpError(status: number, path: string, body: unknown): QlooError {
  const detail = errorMessageFromBody(body);
  let message: string;
  if (status === 401) {
    message = "Qloo rejected the key (401). Check QLOO_API_KEY and that QLOO_BASE_URL is the hackathon host.";
  } else if (status === 403) {
    message = "Qloo does not allow this entity type for this key (403).";
  } else if (status === 429) {
    message = "Qloo rate limit or monthly quota reached (429). Wait a moment and try again.";
  } else if (status === 400) {
    message = `Qloo rejected the parameters (400)${detail ? `: ${detail}` : "."}`;
  } else if (status === 404) {
    message = `Qloo path not found (404) for ${path}${detail ? `: ${detail}` : "."}`;
  } else if (status >= 500) {
    message = `Qloo had a server error (${status}). Try again shortly.`;
  } else {
    message = `Qloo request failed with status ${status}.`;
  }
  return new QlooError(message, status, path);
}

export function createQlooClient(
  transport: QlooTransport,
  mode: "live" | "demo",
  options: QlooClientOptions = {},
): QlooClient {
  async function call(path: string, params: URLSearchParams): Promise<{ body: unknown; fromCache: boolean }> {
    const key = `${path}?${params.toString()}`;
    const cached = cacheGet(key);
    if (cached !== undefined) return { body: cached, fromCache: true };

    const { status, body } = await transport.request(path, params);
    if (options.debug) {
      console.info(`[qloo-debug] mode=${mode} path=${path} status=${status} shape=${describeResponseShape(body)}`);
    }

    // The live API answers an unmatched /search with 200 and an empty array. The error reference
    // also documents a 404 "No results" reply, so that is treated as an empty result too.
    if (path === "/search" && status === 404 && /no results/i.test(errorMessageFromBody(body) ?? "")) {
      return { body: { success: true, results: [] }, fromCache: false };
    }
    if (status < 200 || status >= 300) {
      throw mapHttpError(status, path, body);
    }
    cacheSet(key, body);
    return { body, fromCache: false };
  }

  return {
    mode,

    async search(input: SearchInput): Promise<NormalizedEntity[]> {
      const query = input.query.trim();
      if (!query) throw new QlooError("Search query is empty.", 400, "/search");
      const params = new URLSearchParams();
      params.set("query", query);
      params.set("types", input.types.join(","));
      if (input.filterLocation) params.set("filter.location", input.filterLocation);
      if (input.filterRadiusMiles !== undefined) {
        params.set("filter.radius", String(clampInt(input.filterRadiusMiles, 0, 100, 10)));
      }
      params.set("take", String(clampInt(input.take, 1, 50, 10)));
      const { body } = await call("/search", params);
      return entitiesFromSearchBody(body);
    },

    async insights(input: InsightsInput): Promise<InsightsOutput> {
      const seeds = (input.interestEntityIds ?? []).filter(Boolean);
      const exclude = (input.excludeEntityIds ?? []).filter(Boolean);
      // Documented rule: a request needs at least one valid signal or filter.
      const hasLocation = Boolean(input.filterLocation || input.filterLocationQuery || input.signalLocationQuery);
      if (seeds.length === 0 && !hasLocation) {
        throw new QlooError("Insights needs at least one interest entity or a location filter.", 400, "/v2/insights");
      }
      const params = new URLSearchParams();
      params.set("filter.type", input.filterType);
      if (seeds.length > 0) params.set("signal.interests.entities", seeds.join(","));
      if (input.signalLocationQuery) params.set("signal.location.query", input.signalLocationQuery);
      if (exclude.length > 0) params.set("filter.exclude.entities", exclude.join(","));
      if (input.filterLocation) params.set("filter.location", input.filterLocation);
      if (input.filterLocationQuery) params.set("filter.location.query", input.filterLocationQuery);
      params.set("take", String(clampInt(input.take, 1, 50, 20)));
      const { body, fromCache } = await call("/v2/insights", params);
      const parsed = entitiesFromInsightsBody(body);
      return { entities: parsed.entities, durationSec: parsed.durationSec, fromCache };
    },
  };
}

export interface LiveTransportOptions {
  /** Injected in tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Wait before the single retry. The hackathon key allows 5 requests per second, and the window resets after one second. */
  retryDelayMs?: number;
}

const REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_RETRY_DELAY_MS = 1_100;

/**
 * Live HTTP transport. The key is sent only in the X-Api-Key header.
 * A 429 or a network failure is retried once after a short wait. Other statuses are returned as they are.
 */
export function liveTransport(baseUrl: string, apiKey: string, options: LiveTransportOptions = {}): QlooTransport {
  const base = baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  async function once(url: string): Promise<{ status: number; body: unknown }> {
    const res = await doFetch(url, {
      method: "GET",
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { message: text.slice(0, 300) };
      }
    }
    return { status: res.status, body };
  }

  return {
    async request(path, params) {
      const query = params.toString();
      const url = `${base}${path}${query ? `?${query}` : ""}`;
      let failure: unknown = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        try {
          const reply = await once(url);
          if (reply.status !== 429 || attempt === 2) return reply;
        } catch (err) {
          failure = err;
        }
      }
      const reason = failure instanceof Error ? failure.name : "unknown error";
      throw new QlooError(`Could not reach Qloo (${reason}). Check QLOO_BASE_URL and network access.`, 0, path);
    },
  };
}
