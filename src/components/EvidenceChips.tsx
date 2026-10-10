import type { EvidenceChip } from "@/lib/types/stagehand";

/** Shows only evidence that Qloo calls actually returned. Empty when there is none. */
export function EvidenceChips({ chips }: { chips: EvidenceChip[] }) {
  if (chips.length === 0) {
    return <p className="font-mono text-xs text-ink-500">No Qloo evidence recorded for this entity.</p>;
  }
  return (
    <div>
      <p className="caption mb-2 flex items-center gap-2 text-ink-500" aria-hidden="true">
        <span className="h-2 w-2 bg-tape-700" />
        Qloo evidence
      </p>
      <ul className="flex flex-wrap gap-1.5" aria-label="Qloo evidence">
        {chips.slice(0, 6).map((chip, index) => (
          <li
            key={`${chip.label}-${chip.value}-${index}`}
            className="flex max-w-full items-stretch border border-ink-900/25 bg-paper-50 font-mono text-xs leading-5"
          >
            <span className="shrink-0 border-r border-ink-900/20 bg-paper-200 px-2 py-0.5 text-ink-500">{chip.label}</span>
            <span className="min-w-0 break-words px-2 py-0.5 font-medium text-ink-900">{chip.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
