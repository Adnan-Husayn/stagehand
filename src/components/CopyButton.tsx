"use client";

import { useEffect, useState } from "react";

/** For browsers that block the async clipboard API: copy from a temporary selection. */
function copyWithSelection(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.opacity = "0";
  document.body.appendChild(area);
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  previous?.focus({ preventScroll: true });
  return copied;
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState(copyWithSelection(text) ? "copied" : "failed");
    }
  }

  const tone =
    state === "copied"
      ? "border-ink-900 bg-ink-900 text-paper-50"
      : state === "failed"
        ? "border-signal-700 bg-paper-50 text-signal-700"
        : "border-ink-900 bg-paper-50 text-ink-900 shadow-press-sm hover:-translate-x-px hover:-translate-y-px hover:shadow-press active:translate-x-0.5 active:translate-y-0.5 active:shadow-none";

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        data-state={state}
        className={`caption inline-flex min-h-10 min-w-[6.75rem] shrink-0 items-center self-start justify-center gap-2 rounded-sm border px-3 transition duration-150 ${tone}`}
      >
        {state === "copied" ? (
          <span key="copied" className="inline-flex animate-stamp items-center gap-2">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true" focusable="false">
              <path
                d="M2.5 8.5l3.5 3.5 7.5-8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeDasharray="18"
                className="animate-draw"
              />
            </svg>
            Copied
          </span>
        ) : state === "failed" ? (
          "Copy failed"
        ) : (
          <>
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true" focusable="false">
              <path d="M5.5 5.5v-3h8v8h-3M2.5 5.5h8v8h-8z" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            Copy
          </>
        )}
      </button>
      <span className="sr-only" role="status">
        {state === "copied" ? `Copied ${label} to the clipboard.` : state === "failed" ? `Could not copy ${label}.` : ""}
      </span>
    </>
  );
}
