// SAMPLE DATA ONLY. Every name below is fictional. These records are shaped like the
// documented Qloo response fields but are NOT real Qloo output. Ids are prefixed "sample-".
import { ENTITY_TYPE_URN } from "../qloo/types";

export const FIXTURE_NOTICE =
  "Sample fixtures shaped like documented Qloo responses. Fictional names and numbers, not real Qloo output.";

export interface FixtureEntity {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  popularity?: number;
  rating?: number;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function make(type: keyof typeof ENTITY_TYPE_URN, names: [string, number, string?][]): FixtureEntity[] {
  return names.map(([name, popularity, subtype]) => ({
    id: `sample-${type}-${slug(name)}`,
    name,
    type: ENTITY_TYPE_URN[type],
    popularity,
    ...(subtype ? { subtype } : {}),
    ...(type === "place" ? { rating: Math.round((3.8 + (popularity % 1) * 1.1) * 10) / 10 } : {}),
  }));
}

export const SAMPLE_ARTISTS = make("artist", [
  ["The Larkspur Hour", 0.82, "indie folk"],
  ["Velvet Anchor", 0.77, "dream pop"],
  ["Marlow and the Tides", 0.71, "americana"],
  ["Night Ferry", 0.69, "synth pop"],
  ["Copper Tennis", 0.66, "indie rock"],
  ["Sable Orchard", 0.63, "folk"],
  ["Lowtide Choir", 0.6, "post punk"],
  ["Paper Lanterns Club", 0.58, "indie pop"],
  ["Glasshouse Kids", 0.55, "alt rock"],
  ["Mira Quell", 0.53, "singer songwriter"],
  ["Dustbowl Parade", 0.5, "roots rock"],
  ["Northline", 0.48, "shoegaze"],
  ["Fable Coast", 0.46, "indie folk"],
  ["Ember Gardens", 0.44, "electronic"],
  ["Harbor Saints", 0.41, "garage rock"],
  ["Saltwater Revival", 0.39, "soul"],
]);

export const SAMPLE_PLACES = make("place", [
  ["Harbour Lane Coffee", 0.74, "cafe"],
  ["The Gilded Tap", 0.71, "bar"],
  ["Marrow Kitchen", 0.7, "restaurant"],
  ["Corner Record Bar", 0.68, "bar"],
  ["Ninth Street Noodles", 0.62, "restaurant"],
  ["The Lantern Room", 0.6, "music venue"],
  ["Oak and Ember", 0.58, "restaurant"],
  ["Dockside Smokehouse", 0.55, "restaurant"],
  ["Vinyl and Vine", 0.53, "wine bar"],
  ["Pier Nine Brewing", 0.5, "brewery"],
  ["Blue Heron Bistro", 0.47, "restaurant"],
  ["Foundry Cafe", 0.44, "cafe"],
]);

export const SAMPLE_BRANDS = make("brand", [
  ["Northgate Outdoor Co", 0.79],
  ["Tidewater Denim", 0.73],
  ["Pinecrest Coffee Roasters", 0.7],
  ["Ridgeline Audio", 0.66],
  ["Halcyon Sparkling Water", 0.63],
  ["Kestrel Bicycles", 0.6],
  ["Moss and Thread Apparel", 0.57],
  ["Brightline Energy Drinks", 0.54],
  ["Solace Candle Co", 0.5],
  ["Juniper Cider", 0.47],
]);

export const SAMPLE_PODCASTS = make("podcast", [
  ["The Long Walk Podcast", 0.8],
  ["Back Booth Stories", 0.72],
  ["Gig Economy Blues", 0.67],
  ["Sound Check Diaries", 0.64],
  ["Night Shift Cities", 0.59],
  ["Analog Hour", 0.56],
  ["Crate Digging Club", 0.52],
  ["Tour Bus Confessions", 0.49],
]);

export const SAMPLE_MOVIES = make("movie", [
  ["Salt Road", 0.75],
  ["Quiet Engines", 0.7],
  ["The Last Ferry", 0.66],
  ["Paper Moon Rising", 0.62],
  ["Glass City Nights", 0.58],
  ["Winter Circuit", 0.55],
  ["Harvest Lights", 0.51],
  ["Under the Overpass", 0.48],
]);

export const SAMPLE_TV_SHOWS = make("tv_show", [
  ["Backroads Beat", 0.76],
  ["The Green Room Years", 0.71],
  ["Harbor Lights", 0.67],
  ["Sundown Sessions", 0.63],
  ["Small Town Static", 0.6],
  ["Ferry Street", 0.56],
  ["The Late Set", 0.52],
  ["Copperfield Diaries", 0.47],
]);

export function sampleLocalityFor(query: string): FixtureEntity {
  const cleaned = query.trim().replace(/\s+/g, " ") || "Sample City";
  const name = cleaned;
  return { id: `sample-locality-${slug(cleaned)}`, name, type: ENTITY_TYPE_URN.locality };
}

export function poolForType(typeUrn: string): FixtureEntity[] {
  switch (typeUrn) {
    case ENTITY_TYPE_URN.artist:
      return SAMPLE_ARTISTS;
    case ENTITY_TYPE_URN.place:
      return SAMPLE_PLACES;
    case ENTITY_TYPE_URN.brand:
      return SAMPLE_BRANDS;
    case ENTITY_TYPE_URN.podcast:
      return SAMPLE_PODCASTS;
    case ENTITY_TYPE_URN.movie:
      return SAMPLE_MOVIES;
    case ENTITY_TYPE_URN.tv_show:
      return SAMPLE_TV_SHOWS;
    default:
      return [];
  }
}
