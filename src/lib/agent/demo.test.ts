import { beforeEach, describe, expect, it } from "vitest";
import { fixtureTransport } from "../demo/fixture-transport";
import { clearQlooCache, createQlooClient } from "../qloo/client";
import type { ShortlistResult, VenueProfile } from "../types/stagehand";
import { RunContext } from "./context";
import { runDemoAgent, shortlistDemoPlan } from "./demo";
import { shortlistTools } from "./tools";

async function runShortlist(venue: VenueProfile): Promise<ShortlistResult> {
  const ctx = new RunContext(createQlooClient(fixtureTransport(), "demo"), venue, true);
  const plan = shortlistDemoPlan(venue);
  const data = await runDemoAgent({
    steps: plan.steps,
    final: plan.final,
    finalTool: "submit_shortlist",
    tools: shortlistTools(),
    ctx,
    emit: () => {},
    stepDelayMs: 0,
  });
  return data as ShortlistResult;
}

describe("demo shortlist sequence (offline fixtures)", () => {
  beforeEach(() => clearQlooCache());

  it("never recommends the seed artists it was given", async () => {
    const result = await runShortlist({
      venueName: "The Lantern Room",
      city: "Asheville, NC",
      capacity: 300,
      genres: [],
      seedArtists: ["Velvet Anchor", "Night Ferry"],
    });
    const names = result.artists.map((a) => a.name);
    expect(names).not.toContain("Velvet Anchor");
    expect(names).not.toContain("Night Ferry");
    expect(names.length).toBeGreaterThanOrEqual(3);
    expect(names.length).toBeLessThanOrEqual(8);
    expect(result.demo).toBe(true);
  });

  it("still returns a full shortlist with no seeds", async () => {
    const result = await runShortlist({
      venueName: "",
      city: "Asheville, NC",
      capacity: 300,
      genres: [],
      seedArtists: [],
    });
    expect(result.artists.length).toBe(6);
  });
});
