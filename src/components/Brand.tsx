/** Two tape spike marks around a performer's spot. */
export function SpikeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <path d="M15 29V15h14" fill="none" stroke="#ee4231" strokeWidth="7" strokeLinecap="square" />
      <path d="M49 35v14H35" fill="none" stroke="#ee4231" strokeWidth="7" strokeLinecap="square" />
      <circle cx="32" cy="32" r="6.5" fill="#f1e8d6" />
    </svg>
  );
}

export function Arrow({ className, direction = "right" }: { className?: string; direction?: "right" | "left" }) {
  return (
    <svg
      viewBox="0 0 20 12"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={direction === "left" ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M0 6h17M12 1l5.5 5-5.5 5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** Animated level meter. The bars hold still when motion is reduced. */
export function LevelMeter({ className, bars = 5 }: { className?: string; bars?: number }) {
  const rest = [0.45, 0.8, 0.6, 1, 0.35, 0.7, 0.5];
  return (
    <span className={`inline-flex items-end gap-[2px] ${className ?? ""}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className="meter-bar block h-full w-[3px] origin-bottom animate-meter rounded-[1px] bg-current"
          style={{
            animationDelay: `${-(i * 173) % 900}ms`,
            animationDuration: `${760 + ((i * 137) % 380)}ms`,
            transform: `scaleY(${rest[i % rest.length]})`,
          }}
        />
      ))}
    </span>
  );
}
