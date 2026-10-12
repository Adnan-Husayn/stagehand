"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "./Brand";

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
      ? "border-key bg-key text-key-ink shadow-[0_0_44px_-4px_rgba(255,180,74,0.9)]"
      : state === "failed"
        ? "border-stop text-stop"
        : "border-key text-key hover:bg-key hover:text-key-ink";

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        data-state={state}
        className={`inline-flex min-h-11 min-w-[7.25rem] flex-none items-center justify-center gap-2 self-start rounded-full border px-4 text-base font-semibold transition-[background-color,color,box-shadow] duration-150 ${tone}`}
      >
        {state === "copied" ? (
          <>
            <CheckIcon className="h-[0.9rem] w-[0.9rem]" />
            Copied
          </>
        ) : state === "failed" ? (
          "Copy failed"
        ) : (
          <>
            <CopyIcon className="h-[0.9rem] w-[0.9rem]" />
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
