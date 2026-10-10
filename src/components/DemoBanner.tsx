export function DemoBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div role="status" className="paper relative border-y border-ink-900">
      <div className="mx-auto flex max-w-shell items-stretch gap-4 px-4 sm:px-6 lg:px-8">
        <span className="hazard w-7 shrink-0 self-stretch opacity-90 sm:w-10" aria-hidden="true" />
        <p className="py-2.5 text-sm leading-snug text-ink-700">
          <strong className="font-semibold text-ink-900">Demo data. Add API keys to see live results.</strong>{" "}
          Results come from labelled sample fixtures with fictional names. They are not real Qloo output.
        </p>
      </div>
    </div>
  );
}
