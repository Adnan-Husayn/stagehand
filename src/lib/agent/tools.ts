import { ENTITY_TYPE_URN, type NormalizedEntity } from "../qloo/types";
import type { InsightsOutput } from "../qloo/client";
import {
  ENTITY_KINDS,
  type AdTarget,
  type EntityKind,
  type EvidenceChip,
  type PromoPlan,
  type PromoPartner,
  type ShortlistResult,
} from "../types/stagehand";
import type { RunContext } from "./context";
import { InputError, objArr, objField, oneOf, optInt, optStrArr, str, strArr } from "./args";
import { firstUsable, type Attempt } from "./fallback";
import { mentionsCity, pickLocality, splitCity } from "./locality";
import type { AgentTool, ToolOutcome } from "./types";

const AD_PLATFORMS = ["meta", "instagram", "tiktok", "youtube", "spotify", "google", "podcast_ads", "local_radio", "other"] as const;
const KIND_VALUES = ENTITY_KINDS as readonly EntityKind[];
/** Chip label for the experimental location signal. The docs do not confirm it for artists. */
export const LOCATION_CHIP = "location signal (unconfirmed for artists)";

function ok(content: unknown, summary: string): ToolOutcome {
  return { ok: true, content, summary };
}

function fail(error: string): ToolOutcome {
  return { ok: false, error };
}

function slim(entity: NormalizedEntity, rank?: number): Record<string, unknown> {
  return {
    entity_id: entity.id,
    name: entity.name,
    type: entity.type,
    ...(entity.subtype && entity.subtype !== entity.type ? { subtype: entity.subtype } : {}),
    ...(entity.disambiguation && entity.disambiguation !== entity.name ? { context: entity.disambiguation } : {}),
    ...(rank !== undefined ? { rank } : {}),
    ...(entity.popularity !== undefined ? { popularity: entity.popularity } : {}),
    ...(entity.rating !== undefined ? { rating: entity.rating } : {}),
    ...(entity.affinity !== undefined ? { affinity: entity.affinity } : {}),
  };
}

function kindOfUrn(urn: string): EntityKind {
  const match = KIND_VALUES.find((kind) => ENTITY_TYPE_URN[kind] === urn);
  return match ?? "brand";
}

/** Wraps a tool body so validation failures come back to the model as readable errors. */
function guarded(
  body: (input: unknown, ctx: RunContext) => Promise<ToolOutcome>,
): (input: unknown, ctx: RunContext) => Promise<ToolOutcome> {
  return async (input, ctx) => {
    try {
      return await body(input, ctx);
    } catch (err) {
      if (err instanceof InputError) return fail(err.message);
      throw err;
    }
  };
}

function entityChips(entity: NormalizedEntity, runLabel: string, rank: number, total: number, signals: string[]): EvidenceChip[] {
  const chips: EvidenceChip[] = [{ label: `${runLabel} rank`, value: `#${rank} of ${total}` }];
  if (signals.length > 0) chips.push({ label: "Qloo signals", value: signals.join(", ") });
  if (entity.popularity !== undefined) chips.push({ label: "Qloo popularity", value: entity.popularity.toFixed(2) });
  if (entity.affinity !== undefined) chips.push({ label: "Qloo affinity", value: entity.affinity.toFixed(2) });
  if (entity.rating !== undefined) chips.push({ label: "Qloo rating", value: entity.rating.toFixed(1) });
  return chips;
}

function describeAttempts(attempts: string[]): string {
  return attempts.slice(0, -1).length > 0 ? ` after ${attempts.slice(0, -1).join("; ")}` : "";
}

const resolveCity: AgentTool = {
  name: "resolve_city",
  description:
    "Resolve the venue's city to a Qloo locality id (urn:entity:locality). Call this before any local-signal tool. Returns the locality id and name.",
  input_schema: {
    type: "object",
    properties: {
      city: { type: "string", description: "City name, for example 'Asheville, NC'." },
    },
    required: ["city"],
  },
  run: guarded(async (input, ctx) => {
    const city = str(input, "city", 120);
    const types = [ENTITY_TYPE_URN.locality];
    // Qloo's locality search is fuzzy, so the pick must match the city by name (see locality.ts).
    let matches = await ctx.client.search({ query: city, types, take: 10 });
    let top = pickLocality(city, matches);
    const bareName = splitCity(city).name;
    if (!top && bareName && bareName !== city) {
      matches = await ctx.client.search({ query: bareName, types, take: 10 });
      top = pickLocality(city, matches);
    }
    if (!top) {
      return fail(
        `Qloo has no locality that matches "${city}" by name. Carry on without it: find_local_places falls back to a city-name search.`,
      );
    }
    ctx.localityId = top.id;
    ctx.localityName = top.name;
    ctx.localityPoint = top.location ?? null;
    const others = matches.filter((e) => e.id !== top.id).slice(0, 2);
    return ok(
      { locality_id: top.id, locality_name: top.name, context: top.disambiguation ?? null, other_matches: others.map((e) => slim(e)) },
      `Resolved to ${top.disambiguation ?? top.name}`,
    );
  }),
};

const searchEntities: AgentTool = {
  name: "search_entities",
  description:
    "Look up Qloo entity ids by name for an artist, brand, podcast, movie, TV show or place. Use it to turn seed artists into ids. Returns matches with their Qloo ids.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The name to search for." },
      entity_kind: { type: "string", enum: [...KIND_VALUES], description: "Which kind of entity to search." },
      take: { type: "integer", minimum: 1, maximum: 20, description: "How many matches to return (default 8)." },
    },
    required: ["query", "entity_kind"],
  },
  run: guarded(async (input, ctx) => {
    const query = str(input, "query", 120);
    const kind = oneOf(input, "entity_kind", KIND_VALUES);
    const take = optInt(input, "take", 1, 20, 8);
    const results = await ctx.client.search({ query, types: [ENTITY_TYPE_URN[kind]], take });
    ctx.searchHits.set(query, results.map((e) => e.id));
    if (kind === "artist") ctx.noteSeedSearch(query, results);
    for (const entity of results) {
      ctx.remember(entity, "search_entities", [{ label: "Matched search", value: `"${query}"` }]);
    }
    return ok(
      { results: results.map((e, i) => slim(e, i + 1)) },
      `${results.length} ${kind} match${results.length === 1 ? "" : "es"} for "${query}"`,
    );
  }),
};

const findLocalPlaces: AgentTool = {
  name: "find_local_places",
  description:
    "List places (venues, bars, restaurants, cafes, shops) in the venue's city. These place ids are local taste signals for get_insights. Works even if resolve_city failed: Stagehand then falls back to a city-name search and keeps only places whose address names the city.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "What kind of places, for example 'live music bar' or 'record store'." },
      take: { type: "integer", minimum: 1, maximum: 20, description: "How many places to return (default 10)." },
    },
    required: ["query"],
  },
  run: guarded(async (input, ctx) => {
    const query = str(input, "query", 120);
    const take = optInt(input, "take", 1, 20, 10);
    const city = ctx.venue.city;
    const types = [ENTITY_TYPE_URN.place];

    // /search takes coordinates in filter.location. It rejects a locality id, and it ignores
    // city-name filters without saying so. A text search is global, so its results are kept
    // only when Qloo's address line names the venue's city.
    const attempts: Attempt<NormalizedEntity[]>[] = [];
    const point = ctx.localityPoint;
    if (point) {
      attempts.push({
        name: "locality-point",
        run: () =>
          ctx.client.search({ query, types, take, filterLocation: `${point.lat},${point.lon}`, filterRadiusMiles: 10 }),
      });
    }
    const inCity = (found: NormalizedEntity[]) => found.filter((e) => mentionsCity(e, city)).slice(0, take);
    attempts.push({
      name: "text-search",
      run: async () => inCity(await ctx.client.search({ query: `${query} ${city}`.slice(0, 200), types, take: 20 })),
    });
    attempts.push({
      name: "city-search",
      run: async () => inCity(await ctx.client.search({ query: splitCity(city).name || city, types, take: 20 })),
    });

    const outcome = await firstUsable(attempts, (places) => places.length === 0);
    const places = outcome.value;
    // Without a locality, a place confirmed to be in the city gives later local calls a point to filter on.
    if (!ctx.localityPoint) ctx.localityPoint = places.find((e) => e.location)?.location ?? null;
    const label = `Local places "${query}"`;
    places.forEach((entity, i) => {
      ctx.remember(entity, "find_local_places", entityChips(entity, label, i + 1, places.length, []));
      if (!ctx.placeIds.includes(entity.id)) ctx.placeIds.push(entity.id);
    });
    ctx.placeIds = ctx.placeIds.slice(0, 24);
    const where = ctx.localityName ?? city;
    const summary =
      places.length > 0
        ? `${places.length} place${places.length === 1 ? "" : "s"} near ${where} via ${outcome.strategy}${describeAttempts(outcome.attempts)}`
        : `No places found near ${where}; tried ${outcome.attempts.join("; ")}`;
    return ok(
      {
        locality: ctx.localityName,
        strategy: places.length > 0 ? outcome.strategy : null,
        attempts: outcome.attempts,
        places: places.map((e, i) => slim(e, i + 1)),
      },
      summary,
    );
  }),
};

const getInsights: AgentTool = {
  name: "get_insights",
  description:
    "Ask Qloo which entities of one kind over-index for the given signals. interest_entity_ids are Qloo ids from earlier tool results (artists, local places, brands). Set local_only true with entity_kind place to keep results in the venue's city. Seed artists are excluded from artist results. Each call is numbered as an insights run.",
  input_schema: {
    type: "object",
    properties: {
      entity_kind: { type: "string", enum: [...KIND_VALUES], description: "The kind of entity to return." },
      interest_entity_ids: {
        type: "array",
        items: { type: "string" },
        maxItems: 12,
        description: "Qloo ids to use as taste signals. Must come from earlier tool results.",
      },
      local_only: { type: "boolean", description: "Only for entity_kind place: restrict to the venue's city." },
      take: { type: "integer", minimum: 1, maximum: 30, description: "How many results to return (default 15)." },
    },
    required: ["entity_kind"],
  },
  run: guarded(async (input, ctx) => {
    const kind = oneOf(input, "entity_kind", KIND_VALUES);
    const ids = optStrArr(input, "interest_entity_ids", 12);
    const take = optInt(input, "take", 1, 30, 15);
    const localOnly = typeof input === "object" && input !== null && (input as Record<string, unknown>).local_only === true;

    const unknown = ids.filter((id) => !ctx.knows(id));
    if (unknown.length > 0) {
      return fail(
        `These ids were not returned by any earlier tool call: ${unknown.join(", ")}. Use only ids from search_entities, find_local_places or get_insights results.`,
      );
    }
    if (localOnly && kind !== "place") return fail("local_only applies only when entity_kind is place.");
    if (ids.length === 0 && !localOnly) return fail("Provide interest_entity_ids, or use local_only with entity_kind place.");

    const excludeEntityIds = kind === "artist" ? [...ctx.seedArtistIds] : [];
    const base = {
      filterType: ENTITY_TYPE_URN[kind],
      interestEntityIds: ids,
      excludeEntityIds,
      take,
    };

    let output: InsightsOutput;
    let strategy: string | null = null;
    let attempts: string[] = [];
    if (localOnly) {
      const localityId = ctx.localityId;
      const strategies: Attempt<InsightsOutput>[] = [];
      if (localityId) {
        strategies.push({ name: "locality-id", run: () => ctx.client.insights({ ...base, filterLocation: localityId }) });
      }
      // Used when the locality did not resolve but a place in the city gave coordinates.
      const point = ctx.localityPoint;
      if (point && !localityId) {
        strategies.push({
          name: "place-point",
          run: () => ctx.client.insights({ ...base, filterLocation: `POINT(${point.lon} ${point.lat})` }),
        });
      }
      // Qloo resolves the city text to its own best-matching locality, which can be a different
      // town, so only places whose address names the venue's city are kept.
      const city = ctx.venue.city;
      strategies.push({
        name: "location-query",
        run: async () => {
          const found = await ctx.client.insights({ ...base, filterLocationQuery: city });
          return { ...found, entities: found.entities.filter((e) => mentionsCity(e, city)) };
        },
      });
      const outcome = await firstUsable(strategies, (o) => o.entities.length === 0);
      output = outcome.value;
      strategy = outcome.strategy;
      attempts = outcome.attempts;
    } else {
      output = await ctx.client.insights(base);
    }

    const runNumber = ctx.insightRuns.length + 1;
    ctx.insightRuns.push(output.entities.map((e) => e.id));

    const signalNames = ids.slice(0, 3).map((id) => ctx.nameOf(id));
    const localLabel = strategy === "locality-id" ? (ctx.localityName ?? ctx.venue.city) : ctx.venue.city;
    const signals = localOnly ? [...signalNames, `local to ${localLabel}`] : signalNames;
    const label = `Insights run ${runNumber}`;
    output.entities.forEach((entity, i) => {
      ctx.remember(entity, "get_insights", entityChips(entity, label, i + 1, output.entities.length, signals));
    });
    const via = localOnly && strategy ? ` via ${strategy}${describeAttempts(attempts)}` : "";
    return ok(
      {
        run: runNumber,
        entity_kind: kind,
        from_cache: output.fromCache,
        strategy,
        attempts,
        entities: output.entities.map((e, i) => slim(e, i + 1)),
      },
      `Insights run ${runNumber}: ${output.entities.length} ${kind} result${output.entities.length === 1 ? "" : "s"}${via}`,
    );
  }),
};

const getLocationInsights: AgentTool = {
  name: "get_location_insights",
  description:
    "EXPERIMENTAL, optional. Ask Qloo for artists with a location signal set to the venue's city. The docs do not confirm this for artists, so results are labelled unconfirmed. An artist found only this way is rejected by submit_shortlist. Use it alongside get_insights results.",
  input_schema: {
    type: "object",
    properties: {
      take: { type: "integer", minimum: 1, maximum: 30, description: "How many results to return (default 15)." },
    },
    required: [],
  },
  run: guarded(async (input, ctx) => {
    const take = optInt(input, "take", 1, 30, 15);
    const city = ctx.venue.city;
    const output = await ctx.client.insights({
      filterType: ENTITY_TYPE_URN.artist,
      signalLocationQuery: city,
      excludeEntityIds: [...ctx.seedArtistIds],
      take,
    });
    for (const entity of output.entities) {
      ctx.remember(entity, "get_location_insights", [{ label: LOCATION_CHIP, value: city }]);
    }
    return ok(
      {
        unconfirmed: true,
        entity_kind: "artist",
        entities: output.entities.map((e, i) => slim(e, i + 1)),
      },
      `Experimental location signal: ${output.entities.length} artist result${output.entities.length === 1 ? "" : "s"} (unconfirmed for artists)`,
    );
  }),
};

const compareAudiences: AgentTool = {
  name: "compare_audiences",
  description:
    "Run insights for two groups of Qloo ids of the same kind and report which results both groups share. Use it to see whether two signal sets draw the same audience. Seed artists are excluded from artist results.",
  input_schema: {
    type: "object",
    properties: {
      entity_kind: { type: "string", enum: [...KIND_VALUES] },
      ids_a: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 12 },
      ids_b: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 12 },
    },
    required: ["entity_kind", "ids_a", "ids_b"],
  },
  run: guarded(async (input, ctx) => {
    const kind = oneOf(input, "entity_kind", KIND_VALUES);
    const idsA = strArr(input, "ids_a", 1, 12);
    const idsB = strArr(input, "ids_b", 1, 12);
    for (const id of [...idsA, ...idsB]) {
      if (!ctx.knows(id)) return fail(`Id ${id} was not returned by an earlier tool call.`);
    }
    const urn = ENTITY_TYPE_URN[kind];
    const excludeEntityIds = kind === "artist" ? [...ctx.seedArtistIds] : [];
    const [a, b] = await Promise.all([
      ctx.client.insights({ filterType: urn, interestEntityIds: idsA, excludeEntityIds, take: 20 }),
      ctx.client.insights({ filterType: urn, interestEntityIds: idsB, excludeEntityIds, take: 20 }),
    ]);
    const bIds = new Set(b.entities.map((e) => e.id));
    const shared = a.entities.filter((e) => bIds.has(e.id));
    const aIds = new Set(a.entities.map((e) => e.id));
    for (const entity of a.entities) {
      ctx.remember(entity, "compare_audiences", [{ label: "Compared group", value: "A" }]);
    }
    for (const entity of b.entities) {
      ctx.remember(entity, "compare_audiences", [{ label: "Compared group", value: "B" }]);
    }
    for (const entity of shared) {
      ctx.remember(entity, "compare_audiences", [{ label: "Shared audience", value: "appears in both signal groups" }]);
    }
    return ok(
      {
        shared: shared.map((e) => slim(e)),
        only_in_a: a.entities.filter((e) => !bIds.has(e.id)).slice(0, 5).map((e) => slim(e)),
        only_in_b: b.entities.filter((e) => !aIds.has(e.id)).slice(0, 5).map((e) => slim(e)),
      },
      `${shared.length} ${kind} result${shared.length === 1 ? "" : "s"} shared by both groups`,
    );
  }),
};

const submitShortlist: AgentTool = {
  name: "submit_shortlist",
  description:
    "Submit the final ranked shortlist of 3 to 8 artists, best first. Use only artist ids returned by tools in this run. Seed artists the venue already sells must not appear. Each why must cite evidence you saw (insights run and rank, local signals matched, or overlap). Do not claim sales, attendance or fees.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "Two or three sentences on why this list fits the venue." },
      artists: {
        type: "array",
        minItems: 3,
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            entity_id: { type: "string" },
            why: { type: "string", description: "Under three sentences, citing the Qloo evidence." },
          },
          required: ["entity_id", "why"],
        },
      },
    },
    required: ["summary", "artists"],
  },
  run: guarded(async (input, ctx) => {
    const summary = str(input, "summary", 600);
    const items = objArr(input, "artists", 3, 8);
    const seen = new Set<string>();
    const artists = items.map((item) => {
      const id = str(item, "entity_id", 120);
      const why = str(item, "why", 500);
      const entry = ctx.provenance.get(id);
      if (!entry) {
        throw new InputError(`entity_id ${id} was not returned by any tool. Choose only from artist ids you received.`);
      }
      const entity = entry.entity;
      if (entity.type !== ENTITY_TYPE_URN.artist) {
        throw new InputError(`${entity.name} is a ${kindOfUrn(entity.type)}, not an artist.`);
      }
      if (ctx.isSeedArtist(entity)) {
        throw new InputError(
          `${entity.name} is one of this venue's seed artists, which already sell well here. Remove it and replace it with another artist from the Qloo results.`,
        );
      }
      const hasMeasuredSignal = entry.tools.has("get_insights") || entry.tools.has("compare_audiences");
      if (!hasMeasuredSignal) {
        throw new InputError(
          `${entity.name} comes only from the experimental location signal, which is unconfirmed for artists. Choose artists that also appear in get_insights or compare_audiences results.`,
        );
      }
      if (seen.has(id)) throw new InputError(`${entity.name} appears twice.`);
      seen.add(id);
      return { id, why, entity };
    });
    const result: ShortlistResult = {
      mode: "shortlist",
      demo: ctx.demo,
      city: ctx.venue.city,
      localityName: ctx.localityName,
      summary,
      artists: artists.map((a, i) => ({
        entityId: a.id,
        name: a.entity.name,
        rank: i + 1,
        why: a.why,
        evidence: (ctx.provenance.get(a.id)?.chips ?? []).slice(0, 6),
      })),
      generatedAt: new Date().toISOString(),
    };
    return ok(result, `Shortlist of ${artists.length} artists submitted`);
  }),
};

const submitPromoPlan: AgentTool = {
  name: "submit_promo_plan",
  description:
    "Submit the promo plan for the selected artist: 3 to 6 partner entities from Qloo results (brands, places, podcasts, movies or TV shows), 2 to 5 ad targets grounded in those ids, a booking inquiry email to the artist's agent, and a partner pitch to one of the partners.",
  input_schema: {
    type: "object",
    properties: {
      partners: {
        type: "array",
        minItems: 3,
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            entity_id: { type: "string" },
            angle: { type: "string", description: "Why this partner fits the artist's audience, in one sentence." },
          },
          required: ["entity_id", "angle"],
        },
      },
      ad_targeting: {
        type: "array",
        minItems: 2,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            platform: { type: "string", enum: [...AD_PLATFORMS] },
            audience: { type: "string", description: "The audience to target, in plain words." },
            rationale: { type: "string" },
            based_on: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 },
          },
          required: ["platform", "audience", "rationale", "based_on"],
        },
      },
      booking_email: {
        type: "object",
        properties: {
          subject: { type: "string" },
          body: { type: "string", description: "Use [placeholders] for facts you do not know." },
        },
        required: ["subject", "body"],
      },
      partner_pitch: {
        type: "object",
        properties: {
          partner_entity_id: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
        },
        required: ["partner_entity_id", "subject", "body"],
      },
    },
    required: ["partners", "ad_targeting", "booking_email", "partner_pitch"],
  },
  run: guarded(async (input, ctx) => {
    if (!ctx.artist) return fail("No artist is selected for this run.");
    const artistId = ctx.artist.entityId;

    const partnerItems = objArr(input, "partners", 3, 6);
    const partnerIds = new Set<string>();
    const partners: PromoPartner[] = partnerItems.map((item) => {
      const id = str(item, "entity_id", 120);
      const entity = ctx.provenance.get(id)?.entity;
      if (!entity) throw new InputError(`Partner ${id} was not returned by any tool.`);
      if (entity.type === ENTITY_TYPE_URN.artist || id === artistId) {
        throw new InputError(`${entity.name} is an artist. Partners must be brands, places, podcasts, movies or TV shows.`);
      }
      if (partnerIds.has(id)) throw new InputError(`${entity.name} is listed twice.`);
      partnerIds.add(id);
      return {
        entityId: id,
        name: entity.name,
        kind: kindOfUrn(entity.type),
        angle: str(item, "angle", 300),
        evidence: (ctx.provenance.get(id)?.chips ?? []).slice(0, 6),
      };
    });

    const adItems = objArr(input, "ad_targeting", 2, 5);
    const adTargeting: AdTarget[] = adItems.map((item) => {
      const basedOnIds = strArr(item, "based_on", 1, 4);
      for (const id of basedOnIds) {
        if (!ctx.knows(id)) throw new InputError(`based_on id ${id} was not returned by any tool.`);
      }
      return {
        platform: oneOf(item, "platform", AD_PLATFORMS),
        audience: str(item, "audience", 200),
        rationale: str(item, "rationale", 400),
        basedOn: basedOnIds.map((id) => ({ entityId: id, name: ctx.nameOf(id) })),
      };
    });

    const booking = objField(input, "booking_email");
    const pitch = objField(input, "partner_pitch");
    const pitchPartner = str(pitch, "partner_entity_id", 120);
    if (!partnerIds.has(pitchPartner)) {
      throw new InputError("partner_pitch.partner_entity_id must be one of the partners you listed.");
    }

    const plan: PromoPlan = {
      mode: "promo",
      demo: ctx.demo,
      artist: { entityId: artistId, name: ctx.artist.name },
      partners,
      adTargeting,
      bookingEmail: { subject: str(booking, "subject", 160), body: str(booking, "body", 3000) },
      partnerPitch: {
        partnerEntityId: pitchPartner,
        partnerName: ctx.nameOf(pitchPartner),
        subject: str(pitch, "subject", 160),
        body: str(pitch, "body", 3000),
      },
      generatedAt: new Date().toISOString(),
    };
    return ok(plan, `Promo plan with ${partners.length} partners and ${adTargeting.length} ad targets submitted`);
  }),
};

export function shortlistTools(): AgentTool[] {
  return [
    resolveCity,
    searchEntities,
    findLocalPlaces,
    getInsights,
    getLocationInsights,
    compareAudiences,
    submitShortlist,
  ];
}

export function promoTools(): AgentTool[] {
  return [resolveCity, searchEntities, findLocalPlaces, getInsights, compareAudiences, submitPromoPlan];
}
