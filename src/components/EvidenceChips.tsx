import type { EvidenceChip } from "@/lib/types/stagehand";

/** Short values sit on the label's line. Longer ones drop to their own line so they can wrap. */
const INLINE_LIMIT = 22;

/** Ranks and scores such as "#3 of 14" or "0.82" are set as figures. Names stay in the text face. */
const FIGURE = /^[#\d\s.,%/+-]+(of\s+[\d,]+)?$/i;

function Row({ label, value, quiet = false }: { label: string; value: string; quiet?: boolean }) {
  const long = value.length > INLINE_LIMIT;
  const figure = FIGURE.test(value) ? "font-mono text-sm" : "";
  const idStyle = quiet ? "break-all font-mono text-sm text-soft" : "";
  if (long) {
    return (
      <div className="border-t border-hair py-[0.4rem]">
        <dt className="text-soft">{label}</dt>
        <dd className={`mt-[0.1rem] [overflow-wrap:anywhere] ${idStyle}`}>{value}</dd>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-hair py-[0.4rem]">
      <dt className="text-soft">{label}</dt>
      <dd className={`text-right [overflow-wrap:anywhere] ${figure} ${idStyle}`}>{value}</dd>
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
      {rows.length === 0 && <p className="text-ui text-soft">No Qloo evidence recorded for this entity.</p>}
      {(rows.length > 0 || entityId) && (
        <dl aria-label="Qloo evidence" className="border-b border-hair text-ui">
          {rows.map((chip, index) => (
            <Row key={`${chip.label}-${chip.value}-${index}`} label={chip.label} value={chip.value} />
          ))}
          {entityId && <Row label="Qloo ID" value={entityId} quiet />}
        </dl>
      )}
    </div>
  );
}
