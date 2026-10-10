import type { ShortlistArtist } from "@/lib/types/stagehand";
import { EvidenceChips } from "./EvidenceChips";

export function ArtistCard({ artist, onSelect }: { artist: ShortlistArtist; onSelect: (artist: ShortlistArtist) => void }) {
  return (
    <article className="flex flex-col rounded-2xl border border-ink-800 bg-ink-900 p-5 transition hover:border-ink-700">
      <div className="flex items-start gap-4">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ember-500/15 font-mono text-sm font-semibold text-ember-400"
          aria-label={`Rank ${artist.rank}`}
        >
          {String(artist.rank).padStart(2, "0")}
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-tight text-ink-100">{artist.name}</h3>
          <p className="mt-1 text-xs text-ink-500">Qloo id {artist.entityId}</p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-ink-300">{artist.why}</p>

      <div className="mt-4">
        <EvidenceChips chips={artist.evidence} />
      </div>

      <button
        type="button"
        onClick={() => onSelect(artist)}
        className="mt-5 inline-flex items-center justify-center rounded-lg border border-ink-700 px-4 py-2.5 text-sm font-medium text-ink-100 transition hover:border-ember-400 hover:text-ember-400"
      >
        Build promo plan for {artist.name}
      </button>
    </article>
  );
}
