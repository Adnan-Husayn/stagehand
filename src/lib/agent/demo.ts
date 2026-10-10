// Demo mode: replays a fixed plan through the same tools, validators and trace events.
// No model is called. The inputs are derived from fixture results.
import { ENTITY_TYPE_URN } from "../qloo/types";
import type { VenueProfile } from "../types/stagehand";
import type { RunContext } from "./context";
import { executeTool, makeStep } from "./exec";
import type { AgentTool, Emit } from "./types";

interface DemoStep {
  thought: string;
  tool: string;
  input: (ctx: RunContext) => unknown;
}

const DEFAULT_STEP_DELAY_MS = 350;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runDemoAgent(args: {
  steps: DemoStep[];
  final: DemoStep;
  finalTool: string;
  tools: AgentTool[];
  ctx: RunContext;
  emit: Emit;
  stepDelayMs?: number;
}): Promise<unknown> {
  const delay = args.stepDelayMs ?? DEFAULT_STEP_DELAY_MS;
  for (const step of [...args.steps, args.final]) {
    await sleep(delay);
    args.emit({ type: "trace", step: makeStep("thought", step.thought) });
    const tool = args.tools.find((t) => t.name === step.tool);
    if (!tool) throw new Error(`Demo plan references unknown tool ${step.tool}.`);
    const outcome = await executeTool(tool, step.input(args.ctx), args.ctx, args.emit);
    if (!outcome.ok) {
      throw new Error(`Demo step ${step.tool} failed validation: ${outcome.error}`);
    }
    if (step.tool === args.finalTool) {
      args.emit({ type: "trace", step: makeStep("final", "Plan accepted by the validator.") });
      return outcome.content;
    }
  }
  throw new Error("Demo plan did not reach its final step.");
}

function seedIds(ctx: RunContext, seeds: string[]): string[] {
  return seeds
    .map((seed) => ctx.searchHits.get(seed)?.[0])
    .filter((id): id is string => typeof id === "string");
}

function rankArtists(ctx: RunContext, max: number) {
  const rows = [...ctx.provenance.values()].filter(
    (p) =>
      p.entity.type === ENTITY_TYPE_URN.artist &&
      p.tools.has("get_insights") &&
      !ctx.isSeedArtist(p.entity),
  );
  const appearances = (id: string) => ctx.insightRuns.filter((run) => run.includes(id)).length;
  const bestRank = (id: string) => {
    let best = Number.POSITIVE_INFINITY;
    for (const run of ctx.insightRuns) {
      const index = run.indexOf(id);
      if (index >= 0) best = Math.min(best, index + 1);
    }
    return best;
  };
  return rows
    .map((p) => ({ id: p.entity.id, count: appearances(p.entity.id), best: bestRank(p.entity.id) }))
    .sort((a, b) => b.count - a.count || a.best - b.best)
    .slice(0, max);
}

export function shortlistDemoPlan(venue: VenueProfile): { steps: DemoStep[]; final: DemoStep } {
  const seeds = venue.seedArtists.slice(0, 5);
  const steps: DemoStep[] = [
    {
      thought: `Resolving "${venue.city}" to a Qloo locality so local signals can be scoped.`,
      tool: "resolve_city",
      input: () => ({ city: venue.city }),
    },
    {
      thought: "Collecting live-music places in the locality as local taste signals.",
      tool: "find_local_places",
      input: () => ({ query: "live music bar", take: 10 }),
    },
  ];
  for (const seed of seeds) {
    steps.push({
      thought: `Matching seed artist "${seed}" to a Qloo entity id.`,
      tool: "search_entities",
      input: () => ({ query: seed, entity_kind: "artist", take: 3 }),
    });
  }
  steps.push({
    thought: "Asking which artists over-index with the audiences of these local places.",
    tool: "get_insights",
    input: (c) => ({ entity_kind: "artist", interest_entity_ids: c.placeIds.slice(0, 8), take: 20 }),
  });
  if (seeds.length > 0) {
    steps.push({
      thought: "Asking which artists fans of the seed artists also over-index on.",
      tool: "get_insights",
      input: (c) => ({ entity_kind: "artist", interest_entity_ids: seedIds(c, seeds), take: 20 }),
    });
  }
  steps.push({
    thought: "Comparing the two audiences to see which artists appear in both.",
    tool: "compare_audiences",
    input: (c) => ({
      entity_kind: "artist",
      ids_a: (c.insightRuns[0] ?? []).slice(0, 8),
      ids_b: (c.insightRuns[1] ?? c.insightRuns[0] ?? []).slice(0, 8),
    }),
  });
  const final: DemoStep = {
    thought: "Ranking the shortlist from the evidence gathered.",
    tool: "submit_shortlist",
    input: (c) => {
      const ranked = rankArtists(c, 6);
      return {
        summary: `Demo summary: these artists appear most often across Qloo insight runs for ${venue.city}. Built from sample fixtures.`,
        artists: ranked.map((row) => ({
          entity_id: row.id,
          why: `Appears in ${row.count} of ${c.insightRuns.length} Qloo insight run${c.insightRuns.length === 1 ? "" : "s"}; best rank #${row.best}. Demo summary generated from those ranks, not a model judgement.`,
        })),
      };
    },
  };
  return { steps, final };
}

export function promoDemoPlan(venue: VenueProfile): { steps: DemoStep[]; final: DemoStep } {
  const steps: DemoStep[] = [
    {
      thought: `Resolving "${venue.city}" to a locality for local place signals.`,
      tool: "resolve_city",
      input: () => ({ city: venue.city }),
    },
    {
      thought: "Finding brands that over-index with this artist's audience.",
      tool: "get_insights",
      input: (c) => ({ entity_kind: "brand", interest_entity_ids: [c.artist?.entityId ?? ""], take: 10 }),
    },
    {
      thought: "Finding podcasts this audience over-indexes on.",
      tool: "get_insights",
      input: (c) => ({ entity_kind: "podcast", interest_entity_ids: [c.artist?.entityId ?? ""], take: 10 }),
    },
    {
      thought: "Finding films with the same audience.",
      tool: "get_insights",
      input: (c) => ({ entity_kind: "movie", interest_entity_ids: [c.artist?.entityId ?? ""], take: 10 }),
    },
    {
      thought: "Finding local places that match this artist's fans, kept inside the venue's locality.",
      tool: "get_insights",
      input: (c) => ({ entity_kind: "place", interest_entity_ids: [c.artist?.entityId ?? ""], local_only: true, take: 10 }),
    },
  ];
  const final: DemoStep = {
    thought: "Turning the strongest cross-domain matches into partner, ad and outreach drafts.",
    tool: "submit_promo_plan",
    input: (c) => {
      const artist = c.artist;
      const pick = (run: number) => c.insightRuns[run]?.find((id) => id !== artist?.entityId);
      const partnerIds = [pick(0), pick(1), pick(2), pick(3)].filter((id): id is string => !!id);
      const [brand, podcast, , place] = partnerIds;
      const name = (id?: string) => (id ? c.nameOf(id) : "the partner");
      const artistName = artist?.name ?? "the artist";
      const venueLabel = venue.venueName || `${venue.city} venue`;
      const localNames = (c.insightRuns[3] ?? []).slice(0, 3).map((id) => c.nameOf(id)).join(", ") || "local venues";
      const adTargets = [
        brand && {
          platform: "meta",
          audience: `Fans of ${artistName} who engage with ${name(brand)}`,
          rationale: "Demo template: overlap between the artist signal and the brand result.",
          based_on: [brand, artist?.entityId ?? ""].filter(Boolean),
        },
        podcast && {
          platform: "podcast_ads",
          audience: `Listeners of ${name(podcast)}`,
          rationale: "Demo template: podcast result from the same artist signal.",
          based_on: [podcast],
        },
        place && {
          platform: "instagram",
          audience: `People who engage with ${name(place)} and similar local spots`,
          rationale: "Demo template: local place result, scoped to the venue's locality.",
          based_on: [place],
        },
      ].filter((t): t is NonNullable<typeof t> => !!t);
      return {
        partners: partnerIds.slice(0, 4).map((id) => ({
          entity_id: id,
          angle: `Demo template: a top result for ${artistName}'s signal in the Qloo run for this kind.`,
        })),
        ad_targeting: adTargets,
        booking_email: {
          subject: `Booking inquiry: ${artistName} at ${venueLabel}`,
          body: [
            "Hi [Agent name],",
            "",
            `I book shows at ${venueLabel}, a ${venue.capacity}-capacity room in ${venue.city}. We would like to offer ${artistName} a date on [proposed date].`,
            "",
            `Local signals we are working from include ${localNames}. [Add any real ticket history or draw figures here.]`,
            "",
            "We can offer [guarantee or door deal]. Could you send availability and your rider?",
            "",
            "Thanks,",
            "[Your name]",
            venueLabel,
            "",
            "Demo template draft. Edit before sending.",
          ].join("\n"),
        },
        partner_pitch: {
          partner_entity_id: brand ?? partnerIds[0] ?? "",
          subject: `Partnership idea: ${artistName} show at ${venueLabel}`,
          body: [
            `Hi [Partner contact],`,
            "",
            `We are planning a ${artistName} show at ${venueLabel} and think ${name(brand ?? partnerIds[0])} would be a good partner for it.`,
            "",
            "Possible shapes: co-branded ticket perk, in-venue sampling, or a shared social push. [Describe your terms.]",
            "",
            "Demo template draft. Edit before sending.",
          ].join("\n"),
        },
      };
    },
  };
  return { steps, final };
}
