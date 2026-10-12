export function DemoBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div role="status" className="intro intro-demo relative z-[2] border-y border-hair bg-panel/[0.92]">
      <p className="px-pad py-[0.65rem] text-ui text-soft">
        <strong className="font-semibold text-key">Demo data. Add API keys to see live results.</strong>{" "}
        Results come from labelled sample fixtures with fictional names. They are not real Qloo output.
      </p>
    </div>
  );
}
