import type { EvidenceChip } from "@/lib/types/stagehand";

/** Shows only evidence that Qloo calls actually returned. Empty when there is none. */
export function EvidenceChips({ chips }: { chips: EvidenceChip[] }) {
  if (chips.length === 0) {
    return <p className="text-xs text-ink-500">No Qloo evidence recorded for this entity.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Qloo evidence">
      {chips.slice(0, 6).map((chip, index) => (
        <li
          key={`${chip.label}-${chip.value}-${index}`}
          className="max-w-full rounded-md border border-ink-700 bg-ink-950 px-2.5 py-1 text-xs text-ink-300"
        >
          <span className="text-ink-500">{chip.label}: </span>
          <span className="font-medium text-tide-400 break-words">{chip.value}</span>
        </li>
      ))}
    </ul>
  );
}
