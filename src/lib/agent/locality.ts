import type { NormalizedEntity } from "../qloo/types";
import { normalizeName } from "./context";

// Qloo's locality search is fuzzy. "Portland, ME" lists a South Portland neighbourhood and
// Portland, Oregon ahead of Portland, Maine, and a town Qloo does not know comes back as some
// other place with a similar word in its name. These helpers choose a locality only when its
// name matches the venue's city, and they check that a place's address names the city.

const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const COUNTRY_ALIASES: Record<string, string> = {
  UK: "United Kingdom",
  GB: "United Kingdom",
  US: "United States of America",
  USA: "United States of America",
};

/** Splits "Asheville, NC" into the city name and the region parts after it. */
export function splitCity(city: string): { name: string; regions: string[] } {
  const parts = city.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  return { name: parts[0] ?? "", regions: parts.slice(1) };
}

/** Every normalised spelling a region part may take in Qloo's text: "ME" also gives "maine". */
function regionSpellings(regions: string[]): Set<string> {
  const spellings = new Set<string>();
  for (const region of regions) {
    spellings.add(normalizeName(region));
    const code = region.replace(/\./g, "").toUpperCase();
    const long = US_STATES[code] ?? COUNTRY_ALIASES[code];
    if (long) spellings.add(normalizeName(long));
  }
  spellings.delete("");
  return spellings;
}

function hasWords(text: string, words: string): boolean {
  return words !== "" && ` ${text} `.includes(` ${words} `);
}

/**
 * Chooses the locality for a venue city from Qloo's search results, or null when none fits.
 * A candidate must carry the city's name. When the venue gave a region ("Portland, ME"), a
 * candidate inside that region wins, including one whose longer name contains the city
 * ("Athens-Clarke County Unified Government" for "Athens, GA"). The search order is kept otherwise.
 */
export function pickLocality(city: string, candidates: NormalizedEntity[]): NormalizedEntity | null {
  const { name, regions } = splitCity(city);
  const wantName = normalizeName(name);
  if (!wantName) return null;
  const wantFull = normalizeName(city);
  const exact = candidates.filter((c) => {
    const candidateName = normalizeName(c.name);
    return candidateName === wantName || candidateName === wantFull;
  });
  const spellings = regionSpellings(regions);
  if (spellings.size === 0) return exact[0] ?? null;

  const inRegion = (c: NormalizedEntity) =>
    (c.disambiguation ?? "").split(",").some((part) => spellings.has(normalizeName(part)));
  const partial = candidates.filter((c) => !exact.includes(c) && hasWords(normalizeName(c.name), wantName));
  return exact.find(inRegion) ?? partial.find(inRegion) ?? exact[0] ?? null;
}

/** True when Qloo's address line for a place names the venue's city. */
export function mentionsCity(entity: NormalizedEntity, city: string): boolean {
  return hasWords(normalizeName(entity.disambiguation ?? ""), normalizeName(splitCity(city).name));
}
