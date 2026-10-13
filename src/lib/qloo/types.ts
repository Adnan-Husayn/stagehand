import type { EntityKind } from "../types/stagehand";

// Entity type URNs accepted by filter.type (insights) and types (search).
export const ENTITY_TYPE_URN: Record<EntityKind | "locality", string> = {
  artist: "urn:entity:artist",
  place: "urn:entity:place",
  brand: "urn:entity:brand",
  podcast: "urn:entity:podcast",
  movie: "urn:entity:movie",
  tv_show: "urn:entity:tv_show",
  locality: "urn:entity:locality",
};

export interface NormalizedEntity {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  popularity?: number;
  rating?: number;
  /** Affinity or score as Qloo returns it (query.affinity, affinity or score). Never computed. */
  affinity?: number;
  /** Qloo's own one-line context: a street address for a place, the parent regions for a locality. */
  disambiguation?: string;
  /** Coordinates, present on localities and places. */
  location?: { lat: number; lon: number };
}
