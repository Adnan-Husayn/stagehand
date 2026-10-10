import type { StartRequest, VenueProfile } from "../types/stagehand";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function textList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().slice(0, maxLength))
    .filter((v) => v.length > 0)
    .slice(0, maxItems);
}

function parseVenue(raw: unknown): Result<VenueProfile> {
  if (!isObject(raw)) return { ok: false, error: "venue is required." };
  const city = text(raw.city, 80);
  if (city.length < 2) return { ok: false, error: "Enter the venue's city." };
  const capacityNumber = typeof raw.capacity === "number" ? Math.round(raw.capacity) : 300;
  if (capacityNumber < 20 || capacityNumber > 5000) {
    return { ok: false, error: "Capacity must be between 20 and 5000." };
  }
  return {
    ok: true,
    value: {
      venueName: text(raw.venueName, 120),
      city,
      capacity: capacityNumber,
      genres: textList(raw.genres, 8, 40),
      seedArtists: textList(raw.seedArtists, 5, 80),
    },
  };
}

export function parseStartRequest(body: unknown): Result<StartRequest> {
  if (!isObject(body)) return { ok: false, error: "Request body must be a JSON object." };
  const venue = parseVenue(body.venue);
  if (!venue.ok) return venue;
  if (body.mode === "shortlist") {
    return { ok: true, value: { mode: "shortlist", venue: venue.value } };
  }
  if (body.mode === "promo") {
    if (!isObject(body.artist)) return { ok: false, error: "artist is required for promo mode." };
    const entityId = text(body.artist.entityId, 120);
    const name = text(body.artist.name, 120);
    if (!entityId || !name) return { ok: false, error: "artist needs entityId and name." };
    return { ok: true, value: { mode: "promo", venue: venue.value, artist: { entityId, name } } };
  }
  return { ok: false, error: 'mode must be "shortlist" or "promo".' };
}
