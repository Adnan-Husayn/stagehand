"use client";

import type { TraceStep } from "@/lib/types/stagehand";
import { QLOO_TOOL_NAMES } from "@/lib/client/stream";

function label(step: TraceStep): string {
  switch (step.kind) {
    case "status":
      return "Status";
    case "thought":
      return "Agent";
    case "tool_call":
      return "Call";
    case "tool_result":
      return "Result";
    case "final":
      return "Accepted";
    case "error":
      return "Error";
  }
}

export function ActivityPanel({ trace, running }: { trace: TraceStep[]; running: boolean }) {
  return (
    <section aria-labelledby="activity-heading" className="flex h-full flex-col rounded-2xl border border-ink-800 bg-ink-900">
      <header className="flex items-center justify-between border-b border-ink-800 px-5 py-4">
        <div>
          <h2 id="activity-heading" className="text-sm font-semibold text-ink-100">
            Agent activity
          </h2>
          <p className="text-xs text-ink-500">Every Qloo call the agent makes, with its result.</p>
        </div>
        {running && (
          <span className="flex items-center gap-2 text-xs text-tide-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-tide-400" aria-hidden="true" />
            Running
          </span>
        )}
      </header>

      {trace.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-ink-500">
          Activity appears here when a run starts.
        </div>
      ) : (
        <ol className="max-h-[70vh] flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm" aria-live="polite">
          {trace.map((step) => {
            const isQloo = step.tool !== undefined && QLOO_TOOL_NAMES.has(step.tool);
            return (
              <li key={step.id} className="border-l-2 border-ink-700 pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      step.kind === "error"
                        ? "text-xs font-semibold uppercase tracking-wide text-ember-400"
                        : step.kind === "final"
                          ? "text-xs font-semibold uppercase tracking-wide text-tide-400"
                          : "text-xs font-semibold uppercase tracking-wide text-ink-500"
                    }
                  >
                    {label(step)}
                  </span>
                  {step.tool && (
                    <code className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-xs text-ink-100">{step.tool}</code>
                  )}
                  {step.kind === "tool_call" && (
                    <span
                      className={
                        isQloo
                          ? "rounded-full bg-tide-400/15 px-2 py-0.5 text-[11px] font-medium text-tide-400"
                          : "rounded-full bg-ink-700 px-2 py-0.5 text-[11px] font-medium text-ink-300"
                      }
                    >
                      {isQloo ? "Qloo API" : "Agent tool"}
                    </span>
                  )}
                  {step.durationMs !== undefined && (
                    <span className="text-xs text-ink-500">{step.durationMs} ms</span>
                  )}
                </div>
                <p
                  className={
                    step.kind === "thought"
                      ? "mt-1 italic text-ink-300 break-words"
                      : step.kind === "error"
                        ? "mt-1 text-ember-400 break-words"
                        : "mt-1 text-ink-300 break-words"
                  }
                >
                  {step.detail}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
