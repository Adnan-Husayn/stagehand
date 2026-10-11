/** Three bars of falling length: a ranked line-up. */
export function LineupMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path d="M2 4h20v4H2zM2 10h14v4H2zM2 16h8v4H2z" fill="currentColor" />
    </svg>
  );
}

export function Arrow({ className, direction = "right" }: { className?: string; direction?: "right" | "left" }) {
  return (
    <svg
      viewBox="0 0 16 10"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={direction === "left" ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M0 5h14M10 1l4.5 4-4.5 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Blinking square shown while a run or a call is in progress. It holds still when motion is reduced. */
export function LiveDot({ className }: { className?: string }) {
  return <span className={`inline-block h-2 w-2 shrink-0 animate-blink bg-ink ${className ?? ""}`} aria-hidden="true" />;
}
