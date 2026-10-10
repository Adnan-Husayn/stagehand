import { beforeEach, describe, expect, it } from "vitest";
import { clearQlooCache } from "../qloo/client";
import { promoTools } from "./tools";
import { callTool, insightsOk, makeContext, rawEntity, scriptedTransport, type Handler } from "@/test/helpers";

const BRAND = rawEntity("brand-northgate", "Northgate Outdoor Co", "urn:entity:brand");
const PODCAST = rawEntity("podcast-back-booth", "Back Booth Stories", "urn:entity:podcast");
const MOVIE = rawEntity("movie-salt-road", "Salt Road", "urn:entity:movie");
const TV = rawEntity("tv-harbor-lights", "Harbor Lights", "urn:entity:tv_show");
const PLACE = rawEntity("place-harbour-lane", "Harbour Lane Coffee", "urn:entity:place");
const ARTIST_ID = "artist-velvet";

const handler: Handler = (path, params) => {
  if (path !== "/v2/insights") return { status: 404, body: { message: "unknown path" } };
  const byKind: Record<string, unknown[]> = {
    "urn:entity:brand": [BRAND],
    "urn:entity:podcast": [PODCAST],
    "urn:entity:movie": [MOVIE],
    "urn:entity:tv_show": [TV],
    "urn:entity:place": [PLACE],
  };
  return insightsOk(byKind[params["filter.type"]] ?? []);
};

const tools = promoTools();

/** A promo run for Velvet Anchor, with one insights run per partner kind. */
async function setupPromo() {
  const ctx = makeContext(scriptedTransport(handler), {});
  ctx.artist = { entityId: ARTIST_ID, name: "Velvet Anchor" };
  ctx.remember({ id: ARTIST_ID, name: "Velvet Anchor", type: "urn:entity:artist" }, "selected", []);
  for (const kind of ["brand", "podcast", "movie", "tv_show", "place"] as const) {
    await callTool(ctx, tools, "get_insights", { entity_kind: kind, interest_entity_ids: [ARTIST_ID] });
  }
  return ctx;
}

const validPlan = () => ({
  partners: [
    { entity_id: "brand-northgate", angle: "Outdoor fans also buy gear." },
    { entity_id: "podcast-back-booth", angle: "Listeners overlap with the artist's fans." },
    { entity_id: "tv-harbor-lights", angle: "Same audience watches this show." },
  ],
  ad_targeting: [
    {
      platform: "meta",
      audience: "Fans of Velvet Anchor who engage with Northgate",
      rationale: "Overlap between the artist and the brand results.",
      based_on: ["brand-northgate", ARTIST_ID],
    },
    {
      platform: "podcast_ads",
      audience: "Listeners of Back Booth Stories",
      rationale: "Podcast result from the artist signal.",
      based_on: ["podcast-back-booth"],
    },
  ],
  booking_email: { subject: "Booking inquiry", body: "Hi [Agent name], proposed date: [date]." },
  partner_pitch: {
    partner_entity_id: "brand-northgate",
    subject: "Partnership idea",
    body: "Possible shapes: [your terms].",
  },
});

describe("submit_promo_plan validator", () => {
  beforeEach(() => clearQlooCache());

  it("accepts a plan built from tool results, including a TV show partner", async () => {
    const ctx = await setupPromo();
    const outcome = await callTool(ctx, tools, "submit_promo_plan", validPlan());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const plan = outcome.content as { partners: { kind: string }[] };
      expect(plan.partners.map((p) => p.kind)).toEqual(["brand", "podcast", "tv_show"]);
    }
  });

  it("rejects a partner that no tool returned", async () => {
    const ctx = await setupPromo();
    const plan = validPlan();
    plan.partners[0] = { entity_id: "brand-invented", angle: "Made up." };
    const outcome = await callTool(ctx, tools, "submit_promo_plan", plan);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/Partner brand-invented was not returned by any tool/);
  });

  it("rejects the selected artist used as a partner", async () => {
    const ctx = await setupPromo();
    const plan = validPlan();
    plan.partners[2] = { entity_id: ARTIST_ID, angle: "Same artist." };
    const outcome = await callTool(ctx, tools, "submit_promo_plan", plan);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/is an artist/);
  });

  it("rejects a pitch to a partner that is not in the list", async () => {
    const ctx = await setupPromo();
    const plan = validPlan();
    plan.partner_pitch.partner_entity_id = "place-harbour-lane";
    const outcome = await callTool(ctx, tools, "submit_promo_plan", plan);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/must be one of the partners you listed/);
  });

  it("rejects ad targets whose based_on ids were not returned", async () => {
    const ctx = await setupPromo();
    const plan = validPlan();
    plan.ad_targeting[1].based_on = ["ghost-id"];
    const outcome = await callTool(ctx, tools, "submit_promo_plan", plan);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/based_on id ghost-id was not returned by any tool/);
  });

  it("rejects the same partner listed twice", async () => {
    const ctx = await setupPromo();
    const plan = validPlan();
    plan.partners[1] = { entity_id: "brand-northgate", angle: "Again." };
    const outcome = await callTool(ctx, tools, "submit_promo_plan", plan);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/listed twice/);
  });

  it("rejects a plan when no artist has been selected", async () => {
    const ctx = makeContext(scriptedTransport(handler), {});
    const outcome = await callTool(ctx, tools, "submit_promo_plan", validPlan());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/No artist is selected/);
  });
});
