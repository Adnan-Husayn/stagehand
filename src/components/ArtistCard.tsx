import type { ShortlistArtist } from "@/lib/types/stagehand";
import { Arrow } from "./Brand";
import { EvidenceChips } from "./EvidenceChips";

/** Column template shared by the line-up header and every row, so they stay aligned. */
export const LINEUP_GRID =
  "grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-x-4 xl:grid-cols-[3rem_minmax(0,1fr)_16rem] xl:gap-x-8";

/** One row of the line-up. The first rank is set larger, like the top of a bill, and carries the main action. */
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
  const size = top ? "text-xl sm:text-2xl" : "text-lg sm:text-xl";
  return (
    <article className={`${LINEUP_GRID} border-b border-rule py-5 sm:py-6 xl:grid-rows-[auto_1fr]`}>
      <p
        className={`title ${size} text-ink-3`}
        role="img"
        aria-label={total !== undefined ? `Rank ${artist.rank} of ${total}` : `Rank ${artist.rank}`}
      >
        {artist.rank}
      </p>

      <div className="min-w-0">
        <h3 className={`title break-words ${size}`}>{artist.name}</h3>
        <p className="mt-2 max-w-[60ch] text-base text-ink-2">{artist.why}</p>
      </div>

      <div className="col-start-2 mt-4 min-w-0 xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:mt-1.5">
        <p className="label mb-1.5 xl:hidden" aria-hidden="true">
          Evidence from Qloo
        </p>
        <EvidenceChips chips={artist.evidence} entityId={artist.entityId} />
      </div>

      <div className="col-start-2 mt-4 self-start">
        <button
          type="button"
          onClick={() => onSelect(artist)}
          aria-label={`Build promo plan for ${artist.name}`}
          className={`${top ? "btn-primary min-h-10 px-4" : "btn-secondary"} w-full sm:w-auto`}
        >
          Build promo plan
          <Arrow className="h-2.5 w-4" />
        </button>
      </div>
    </article>
  );
}
