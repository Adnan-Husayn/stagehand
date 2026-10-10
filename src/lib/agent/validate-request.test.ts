import { describe, expect, it } from "vitest";
import { parseStartRequest } from "./validate-request";

const venue = (overrides: Record<string, unknown> = {}) => ({
  venueName: "The Lantern Room",
  city: "Asheville, NC",
  capacity: 300,
  genres: ["indie folk"],
  seedArtists: ["Velvet Anchor"],
  ...overrides,
});

describe("parseStartRequest", () => {
  it("accepts a shortlist request and trims text", () => {
    const result = parseStartRequest({ mode: "shortlist", venue: venue({ city: "  Asheville, NC  " }) });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.mode === "shortlist") {
      expect(result.value.venue.city).toBe("Asheville, NC");
      expect(result.value.venue.capacity).toBe(300);
      expect(result.value.venue.seedArtists).toEqual(["Velvet Anchor"]);
    }
  });

  it("rejects a body that is not an object", () => {
    expect(parseStartRequest(null)).toEqual({ ok: false, error: "Request body must be a JSON object." });
    expect(parseStartRequest([1, 2])).toMatchObject({ ok: false });
  });

  it("requires a venue", () => {
    expect(parseStartRequest({ mode: "shortlist" })).toEqual({ ok: false, error: "venue is required." });
  });

  it("requires a city of at least two characters", () => {
    expect(parseStartRequest({ mode: "shortlist", venue: venue({ city: " A " }) })).toEqual({
      ok: false,
      error: "Enter the venue's city.",
    });
  });

  it("keeps capacity between 20 and 5000", () => {
    expect(parseStartRequest({ mode: "shortlist", venue: venue({ capacity: 19 }) })).toMatchObject({ ok: false });
    expect(parseStartRequest({ mode: "shortlist", venue: venue({ capacity: 5001 }) })).toMatchObject({ ok: false });
    expect(parseStartRequest({ mode: "shortlist", venue: venue({ capacity: 20 }) })).toMatchObject({ ok: true });
    expect(parseStartRequest({ mode: "shortlist", venue: venue({ capacity: 5000 }) })).toMatchObject({ ok: true });
  });

  it("rounds a fractional capacity and defaults a non-number to 300", () => {
    const rounded = parseStartRequest({ mode: "shortlist", venue: venue({ capacity: 249.6 }) });
    expect(rounded.ok && rounded.value.venue.capacity).toBe(250);
    const missing = parseStartRequest({ mode: "shortlist", venue: venue({ capacity: "lots" }) });
    expect(missing.ok && missing.value.venue.capacity).toBe(300);
  });

  it("caps genres at eight and seed artists at five, dropping blanks", () => {
    const result = parseStartRequest({
      mode: "shortlist",
      venue: venue({
        genres: ["  ", ...Array.from({ length: 10 }, (_, i) => `genre ${i}`)],
        seedArtists: ["A", "", "B", "C", "D", "E", "F"],
      }),
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.mode === "shortlist") {
      expect(result.value.venue.genres).toHaveLength(8);
      expect(result.value.venue.seedArtists).toEqual(["A", "B", "C", "D", "E"]);
    }
  });

  it("requires an artist with an entity id and name for promo mode", () => {
    expect(parseStartRequest({ mode: "promo", venue: venue() })).toEqual({
      ok: false,
      error: "artist is required for promo mode.",
    });
    expect(parseStartRequest({ mode: "promo", venue: venue(), artist: { entityId: "x" } })).toEqual({
      ok: false,
      error: "artist needs entityId and name.",
    });
  });

  it("accepts a promo request with an artist", () => {
    const result = parseStartRequest({
      mode: "promo",
      venue: venue(),
      artist: { entityId: "artist-velvet", name: "Velvet Anchor" },
    });
    expect(result.ok && result.value.mode === "promo" && result.value.artist).toEqual({
      entityId: "artist-velvet",
      name: "Velvet Anchor",
    });
  });

  it("rejects an unknown mode", () => {
    expect(parseStartRequest({ mode: "book", venue: venue() })).toEqual({
      ok: false,
      error: 'mode must be "shortlist" or "promo".',
    });
  });
});
