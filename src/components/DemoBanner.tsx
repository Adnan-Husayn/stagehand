export function DemoBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      role="status"
      className="border-b border-gold-400/30 bg-gold-400/10 px-4 py-3 text-sm text-gold-400"
    >
      <p className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold">Demo data. Add API keys to see live results.</span>
        <span className="text-gold-400/80">
          Results come from labelled sample fixtures with fictional names. They are not real Qloo output.
        </span>
      </p>
    </div>
  );
}
