export function DemoBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div role="status" className="border-b border-rule bg-wash">
      <p className="shell py-2.5 text-sm text-ink-2">
        <strong className="font-semibold text-ink">Demo data. Add API keys to see live results.</strong>{" "}
        Results come from labelled sample fixtures with fictional names. They are not real Qloo output.
      </p>
    </div>
  );
}
