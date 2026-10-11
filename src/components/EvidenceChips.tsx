import type { EvidenceChip } from "@/lib/types/stagehand";

/** Short values sit on the label's line. Longer ones drop to their own line so they can wrap. */
const INLINE_LIMIT = 22;

/** Ranks and scores such as "#3 of 14" or "0.82" are set as figures. Names stay in the text face. */
const FIGURE = /^[#\d\s.,%/+-]+(of\s+[\d,]+)?$/i;

function Row({ label, value, quiet = false }: { label: string; value: string; quiet?: boolean }) {
  const tone = quiet ? "text-ink-3" : "text-ink";
  if (value.length > INLINE_LIMIT) {
    return (
      <div className="border-t border-rule py-1.5">
        <dt className="text-ink-2">{label}</dt>
        <dd className={`mt-0.5 ${quiet ? "figure break-all" : "break-words"} ${tone}`}>{value}</dd>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-rule py-1.5">
      <dt className="text-ink-2">{label}</dt>
      <dd className={`shrink-0 text-right ${FIGURE.test(value) ? "figure" : ""} ${tone}`}>{value}</dd>
    </div>
  );
}

/**
 * Evidence as a definition list. Shows only what Qloo calls returned, plus the entity id
 * when one is passed. Empty evidence is stated, never filled in.
 */
export function EvidenceChips({ chips, entityId }: { chips: EvidenceChip[]; entityId?: string }) {
  const rows = chips.slice(0, 6);
  return (
    <div>
      {rows.length === 0 && <p className="text-sm text-ink-2">No Qloo evidence recorded for this entity.</p>}
      {(rows.length > 0 || entityId) && (
        <dl aria-label="Qloo evidence" className="border-b border-rule text-sm">
          {rows.map((chip, index) => (
            <Row key={`${chip.label}-${chip.value}-${index}`} label={chip.label} value={chip.value} />
          ))}
          {entityId && <Row label="Qloo ID" value={entityId} quiet />}
        </dl>
      )}
    </div>
  );
}
