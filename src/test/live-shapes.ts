// Bodies shaped like the live hackathon API's replies, trimmed to the fields Stagehand reads plus a
// few it ignores. The key names and nesting were copied from real responses. The ids, scores and
// business names are invented, so no Qloo data is stored here. City names are real because the
// locality tests depend on how Qloo orders places that share a name.

/** One /search item. Search items have a types array and no type or subtype. */
export function searchItem(
  id: string,
  name: string,
  kind: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name,
    entity_id: id,
    types: [`urn:entity:${kind}`],
    properties: {},
    popularity: 0.95,
    tags: [],
    disambiguation: name,
    ...extra,
  };
}

export function localityItem(id: string, name: string, parents: string, lat: number, lon: number) {
  return searchItem(id, name, "locality", {
    properties: { admin_level: 8, place: "city", ancestors: [] },
    location: { lat, lon },
    disambiguation: `${name}, ${parents}`,
  });
}

export function placeItem(id: string, name: string, address: string, lat = 35.59, lon = -82.55) {
  return searchItem(id, name, "place", {
    properties: {
      address,
      business_rating: 4.5,
      geocode: { city: "Asheville", admin1_region: "North Carolina", country_code: "US" },
    },
    location: { lat, lon },
    disambiguation: address,
  });
}

/** One /v2/insights item. The kind is in subtype, and the affinity sits under query. */
export function insightItem(
  id: string,
  name: string,
  kind: string,
  affinity: number | null = 0.96,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name,
    entity_id: id,
    type: "urn:entity",
    subtype: `urn:entity:${kind}`,
    properties: { short_descriptions: [] },
    popularity: 0.97,
    tags: [],
    disambiguation: kind === "brand" || kind === "podcast" ? "" : name,
    external: {},
    ...(affinity === null ? {} : { query: { affinity, measurements: { audience_growth: 0 } } }),
    ...extra,
  };
}

export function insightPlace(id: string, name: string, address: string, affinity: number | null = 0.9) {
  return insightItem(id, name, "place", affinity, {
    properties: { address, business_rating: 4.6, geocode: { city: "Asheville" } },
    location: { lat: 35.59, lon: -82.55 },
    disambiguation: address,
  });
}

/** /search success. There is no success flag and no duration. No match is 200 with an empty array. */
export function liveSearchBody(results: unknown[]) {
  return { results };
}

/** /v2/insights success. */
export function liveInsightsBody(entities: unknown[]) {
  return { success: true, results: { entities } };
}

/** /search 400, as returned for a locality id in filter.location. */
export const SEARCH_BAD_LOCATION = {
  error: {
    reason: "Bad Request",
    message: "filter.location:  must be in the form lat,lon (e.g. 40.726408,-73.994275)",
    code: 400,
    request_id: "00000000-0000-0000-0000-000000000000",
  },
};

/** /v2/insights 400 with no signal or filter. */
export const INSIGHTS_NO_SIGNAL = {
  errors: [{ message: "at least one valid signal or filter is required for entity insights" }],
};

/** /v2/insights 400 when every signal id is unusable. */
export const INSIGHTS_BAD_SIGNAL = {
  errors: [
    {
      message:
        "All of the provided signal.interests.entities were invalid. At least one valid signal or filter is required for entity insights.",
      path: "signal.interests.entities",
    },
  ],
};

/** The locality results Qloo gives for "Portland, ME", in its order: the right city is third. */
export const PORTLAND_ME_RESULTS = [
  localityItem("loc-meeting-house-hill", "Meeting House Hill", "South Portland, Cumberland, Maine, United States of America", 43.634, -70.243),
  localityItem("loc-portland-or", "Portland", "Multnomah, Oregon, United States of America", 45.537, -122.65),
  localityItem("loc-portland-me", "Portland", "Cumberland, Maine, United States of America", 43.647, -70.168),
  localityItem("loc-south-portland", "South Portland", "Cumberland, Maine, United States of America", 43.63, -70.27),
];

/** "Athens, GA": Qloo files the city under its consolidated government's name. */
export const ATHENS_GA_RESULTS = [
  localityItem("loc-garden-hills", "Garden Hills", "Athens-Clarke County Unified Government, Clarke, Georgia, United States of America", 33.95, -83.39),
  localityItem("loc-athens-ga", "Athens-Clarke County Unified Government", "Clarke, Georgia, United States of America", 33.96, -83.38),
  localityItem("loc-athens-al", "Athens", "Limestone, Alabama, United States of America", 34.8, -86.97),
];

/** A town Qloo has no locality for: every hit shares only the word "Bridge". */
export const HEBDEN_BRIDGE_RESULTS = [
  localityItem("loc-great-bridge", "Great Bridge", "Sandwell, West Midlands Combined Authority, England, United Kingdom", 52.53, -2.036),
  localityItem("loc-guide-bridge", "Guide Bridge", "Tameside, Greater Manchester, England, United Kingdom", 53.472, -2.118),
];
