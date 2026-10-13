import type { ShortlistArtist } from "@/lib/types/stagehand";
import { Arrow } from "./Brand";
import { EvidenceChips } from "./EvidenceChips";

/**
 * One ticket of the shortlist: the rank on the stub, the artist and the evidence on the body.
 * Rank 1 sits in amber light and carries the lit button. The parent sets --i for the stagger.
 */
export function ArtistCard({
  artist,
  onSelect,
  total,
}: {
  artist: ShortlistArtist;
  onSelect: (artist: ShortlistArtist) => void;
  total?: number;
}) {
  const top = artist.rank === 1;
  return (
    <article className={`ticket ticket-in ${top ? "ticket-top" : ""}`}>
      <div className="flex flex-col items-center gap-2 border-r border-dashed border-field px-2 py-5">
        <p
          className={`numeral text-[3.4rem] leading-[0.9] sm:text-[4.6rem] ${
            top ? "text-key [text-shadow:0_0_28px_rgba(255,180,74,0.65)]" : "text-lit"
          }`}
          role="img"
          aria-label={total !== undefined ? `Rank ${artist.rank} of ${total}` : `Rank ${artist.rank}`}
        >
          {artist.rank}
        </p>
      </div>

      <div className="grid min-w-0 gap-x-8 gap-y-[1.1rem] px-[clamp(1rem,2vw,1.6rem)] pb-[1.4rem] pt-5 xl:grid-cols-[minmax(0,1fr)_16.5rem]">
        <div className="min-w-0">
          <h3
            className={`title text-[clamp(1.6rem,2.6vw,2.3rem)] leading-[1.05] [overflow-wrap:anywhere] ${
              top ? "italic" : ""
            }`}
          >
            {artist.name}
          </h3>
          <p className="mt-[0.55rem] max-w-[36rem] text-soft">{artist.why}</p>
          <button
            type="button"
            onClick={() => onSelect(artist)}
            aria-label={`Build promo plan for ${artist.name}`}
            className={`btn mt-[1.1rem] ${top ? "btn-lit" : "btn-ghost"}`}
          >
            Build promo plan
            <Arrow />
          </button>
        </div>

        <div className="min-w-0">
          <p className="label mb-2 !text-soft" aria-hidden="true">
            Evidence from Qloo
          </p>
          <EvidenceChips chips={artist.evidence} entityId={artist.entityId} />
        </div>
      </div>

      <span className="shine" aria-hidden="true" />
    </article>
  );
}
