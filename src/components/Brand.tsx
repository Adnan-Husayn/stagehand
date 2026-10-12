/** The brand mark: a single lamp. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <i
      className={`block h-[0.6rem] w-[0.6rem] rounded-full bg-key shadow-[0_0_14px_3px_rgba(255,180,74,0.7)] ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}

export function Arrow({ className, direction = "right" }: { className?: string; direction?: "right" | "left" }) {
  return (
    <svg
      viewBox="0 0 16 10"
      className={`${direction === "left" ? "-scale-x-100 " : ""}${className ?? ""}`}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0 5h14M10 1l4.5 4-4.5 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" focusable="false">
      <path d="M2.5 8.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function CopyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" focusable="false">
      <path d="M5.5 5.5v-3h8v8h-3M2.5 5.5h8v8h-8z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** A lit lamp that pulses while a run or a call is in progress. It holds still when motion is reduced. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 animate-dot rounded-full bg-key shadow-[0_0_12px_2px_rgba(255,180,74,0.7)] ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}
