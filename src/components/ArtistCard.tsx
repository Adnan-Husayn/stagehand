import type { ShortlistArtist } from "@/lib/types/stagehand";
import { Arrow } from "./Brand";
import { EvidenceChips } from "./EvidenceChips";

export function ArtistCard({
  artist,
  onSelect,
  total,
}: {
  artist: ShortlistArtist;
  onSelect: (artist: ShortlistArtist) => void;
  total?: number;
}) {
  return (
    <article className="ticket paper group relative grid grid-cols-[4.5rem_minmax(0,1fr)] sm:grid-cols-[7rem_minmax(0,1fr)]">
      <div className="relative flex flex-col items-center bg-paper-200/70 px-1 pb-4 pt-5 text-center sm:pt-6">
        <span className="caption text-ink-500" aria-hidden="true">
          Rank
        </span>
        <span
          className="display mt-1 text-[3.25rem] text-signal-600 sm:text-[5rem]"
          role="img"
          aria-label={`Rank ${artist.rank}`}
        >
          {String(artist.rank).padStart(2, "0")}
        </span>
        {total !== undefined && (
          <span className="caption mt-2 text-ink-500" aria-hidden="true">
            of {String(total).padStart(2, "0")}
          </span>
        )}
        <span className="perforation absolute inset-y-3 right-0 w-[2px]" aria-hidden="true" />
      </div>

      <div className="min-w-0 px-4 pb-5 pt-5 sm:px-7 sm:pb-6 sm:pt-6">
        <h3 className="display break-words text-[2rem] text-ink-900 sm:text-[2.75rem]">{artist.name}</h3>
        <p className="mt-3 max-w-[62ch] text-[0.9375rem] leading-relaxed text-ink-700">{artist.why}</p>

        <div className="mt-4">
          <EvidenceChips chips={artist.evidence} />
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-ink-900/20 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 break-all font-mono text-[0.6875rem] leading-4 text-ink-500">
            Qloo id {artist.entityId}
          </p>
          <button
            type="button"
            onClick={() => onSelect(artist)}
            aria-label={`Build promo plan for ${artist.name}`}
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-3 rounded-sm bg-ink-900 px-5 font-display text-lg font-extrabold uppercase tracking-wide text-paper-50 transition duration-150 hover:bg-signal hover:text-ink-900 focus-visible:bg-signal focus-visible:text-ink-900"
          >
            Build promo plan
            <Arrow className="h-3 w-5 transition-transform duration-150 group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </article>
  );
}
