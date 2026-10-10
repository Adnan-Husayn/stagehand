// Shared types. Safe to import from both server and client code (no Node APIs).

export type EntityKind = "artist" | "place" | "brand" | "podcast" | "movie" | "tv_show";

export const ENTITY_KINDS: EntityKind[] = ["artist", "place", "brand", "podcast", "movie", "tv_show"];

export interface VenueProfile {
  venueName: string;
  city: string;
  capacity: number;
  genres: string[];
  seedArtists: string[];
}

export interface EvidenceChip {
  label: string;
  value: string;
}

export interface ShortlistArtist {
  entityId: string;
  name: string;
  rank: number;
  why: string;
  evidence: EvidenceChip[];
}

export interface ShortlistResult {
  mode: "shortlist";
  demo: boolean;
  city: string;
  localityName: string | null;
  summary: string;
  artists: ShortlistArtist[];
  generatedAt: string;
}

export interface PromoPartner {
  entityId: string;
  name: string;
  kind: EntityKind;
  angle: string;
  evidence: EvidenceChip[];
}

export interface AdTarget {
  platform: string;
  audience: string;
  rationale: string;
  basedOn: { entityId: string; name: string }[];
}

export interface EmailDraft {
  subject: string;
  body: string;
}

export interface PartnerPitch extends EmailDraft {
  partnerEntityId: string;
  partnerName: string;
}

export interface PromoPlan {
  mode: "promo";
  demo: boolean;
  artist: { entityId: string; name: string };
  partners: PromoPartner[];
  adTargeting: AdTarget[];
  bookingEmail: EmailDraft;
  partnerPitch: PartnerPitch;
  generatedAt: string;
}

export interface TraceStep {
  id: string;
  kind: "status" | "thought" | "tool_call" | "tool_result" | "error" | "final";
  tool?: string;
  detail: string;
  durationMs?: number;
  at: string;
}

export type AgentEvent =
  | { type: "trace"; step: TraceStep }
  | { type: "result"; data: ShortlistResult | PromoPlan }
  | { type: "error"; message: string }
  | { type: "done" };

export type StartRequest =
  | { mode: "shortlist"; venue: VenueProfile }
  | { mode: "promo"; venue: VenueProfile; artist: { entityId: string; name: string } };

export interface AppStatus {
  demo: boolean;
  model: string;
  qlooHost: string;
}
