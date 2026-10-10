import type { QlooClient } from "../qloo/client";
import type { NormalizedEntity } from "../qloo/types";
import type { EvidenceChip, VenueProfile } from "../types/stagehand";

export interface Provenance {
  entity: NormalizedEntity;
  chips: EvidenceChip[];
  tools: Set<string>;
}

/** Lower-case, accent-free, punctuation-free form of a name, used to compare names loosely. */
export function normalizeName(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Per-run state. Every entity the model may reference is recorded here with the Qloo
 * evidence that produced it. Submissions are validated against this map, so the model
 * cannot cite an id that no Qloo call returned.
 */
export class RunContext {
  readonly provenance = new Map<string, Provenance>();
  readonly searchHits = new Map<string, string[]>();
  readonly insightRuns: string[][] = [];
  readonly lastOutput = new Map<string, unknown>();
  readonly seedNames: Set<string>;
  readonly seedArtistIds = new Set<string>();
  localityId: string | null = null;
  localityName: string | null = null;
  placeIds: string[] = [];
  artist: { entityId: string; name: string } | null = null;

  constructor(
    readonly client: QlooClient,
    readonly venue: VenueProfile,
    readonly demo: boolean,
  ) {
    this.seedNames = new Set(venue.seedArtists.map(normalizeName).filter((name) => name.length > 0));
  }

  remember(entity: NormalizedEntity, tool: string, chips: EvidenceChip[]): void {
    let entry = this.provenance.get(entity.id);
    if (!entry) {
      entry = { entity, chips: [], tools: new Set<string>() };
      this.provenance.set(entity.id, entry);
    }
    entry.tools.add(tool);
    for (const chip of chips) {
      if (!entry.chips.some((c) => c.label === chip.label && c.value === chip.value)) {
        entry.chips.push(chip);
      }
    }
  }

  /**
   * Records which Qloo ids resolve a seed artist. A seed search keeps every artist whose name
   * matches the seed exactly. If none match, the top hit is kept as the best available id.
   */
  noteSeedSearch(query: string, results: NormalizedEntity[]): void {
    const wanted = normalizeName(query);
    if (!this.seedNames.has(wanted)) return;
    const exact = results.filter((e) => normalizeName(e.name) === wanted);
    const resolved = exact.length > 0 ? exact : results.slice(0, 1);
    for (const entity of resolved) this.seedArtistIds.add(entity.id);
  }

  /** True when the entity is one of the venue's seed artists, by resolved id or by name. */
  isSeedArtist(entity: NormalizedEntity): boolean {
    return this.seedArtistIds.has(entity.id) || this.seedNames.has(normalizeName(entity.name));
  }

  knows(id: string): boolean {
    return this.provenance.has(id);
  }

  entityOf(id: string): NormalizedEntity | undefined {
    return this.provenance.get(id)?.entity;
  }

  nameOf(id: string): string {
    return this.provenance.get(id)?.entity.name ?? id;
  }
}
