"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TraceStep } from "@/lib/types/stagehand";
import { QLOO_TOOL_NAMES } from "@/lib/client/stream";
import { LevelMeter } from "./Brand";

type Row =
  | { type: "note"; key: string; step: TraceStep }
  | { type: "thought"; key: string; step: TraceStep }
  | { type: "call"; key: string; n: number; thought?: TraceStep; call: TraceStep; result?: TraceStep }
  | { type: "final"; key: string; step: TraceStep }
  | { type: "error"; key: string; step: TraceStep };

const TOOL_TITLES: Record<string, string> = {
  resolve_city: "Resolve city",
  search_entities: "Search entities",
  find_local_places: "Find local places",
  get_insights: "Get insights",
  compare_audiences: "Compare audiences",
  get_location_insights: "Location insights",
  submit_shortlist: "Submit shortlist",
  submit_promo_plan: "Submit promo plan",
};

function toolTitle(tool: string | undefined): string {
  if (!tool) return "Tool call";
  return TOOL_TITLES[tool] ?? tool.replace(/_/g, " ");
}

/** Folds the flat trace into one row per tool call, with its reasoning and result attached. */
function buildRows(trace: TraceStep[]): Row[] {
  const rows: Row[] = [];
  let n = 0;
  for (const step of trace) {
    if (step.kind === "thought") {
      rows.push({ type: "thought", key: step.id, step });
    } else if (step.kind === "tool_call") {
      n += 1;
      const last = rows[rows.length - 1];
      if (last?.type === "thought") {
        rows[rows.length - 1] = { type: "call", key: last.key, n, thought: last.step, call: step };
      } else {
        rows.push({ type: "call", key: step.id, n, call: step });
      }
    } else if (step.kind === "tool_result") {
      let matched = false;
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const row = rows[i];
        if (row.type === "call" && !row.result && row.call.tool === step.tool) {
          rows[i] = { ...row, result: step };
          matched = true;
          break;
        }
      }
      if (!matched) rows.push({ type: "note", key: step.id, step });
    } else if (step.kind === "final") {
      rows.push({ type: "final", key: step.id, step });
    } else if (step.kind === "error") {
      rows.push({ type: "error", key: step.id, step });
    } else {
      rows.push({ type: "note", key: step.id, step });
    }
  }
  return rows;
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

/** The server's start line names the model in use. The panel shows a neutral label. */
function noteText(step: TraceStep): string {
  if (step.kind === "status" && /^Live run started with /.test(step.detail)) {
    return "Live run started with the Qloo API and a language model.";
  }
  return step.detail;
}

function Tag({ qloo }: { qloo: boolean }) {
  return qloo ? (
    <span className="caption inline-flex items-center gap-1.5 border border-tape-400/60 bg-tape-400/10 px-1.5 text-tape-300">
      <span className="h-1.5 w-1.5 bg-tape-400" aria-hidden="true" />
      Qloo API
    </span>
  ) : (
    <span className="caption inline-flex items-center border border-stage-600 px-1.5 text-bone-400">Agent tool</span>
  );
}

function Node({ tone, live }: { tone: "qloo" | "agent" | "error" | "done" | "quiet"; live?: boolean }) {
  const color =
    tone === "qloo"
      ? "border-tape-400 bg-tape-400"
      : tone === "error"
        ? "border-signal bg-signal"
        : tone === "done"
          ? "border-bone-100 bg-bone-100"
          : tone === "agent"
            ? "border-bone-400 bg-stage-900"
            : "border-stage-600 bg-stage-900";
  return (
    <span
      className={`absolute left-[-5px] top-[0.4rem] h-[9px] w-[9px] rounded-full border ${color} ${live ? "animate-live-ring" : ""}`}
      aria-hidden="true"
    />
  );
}

function CallRow({ row, running }: { row: Extract<Row, { type: "call" }>; running: boolean }) {
  const tool = row.call.tool;
  const qloo = tool !== undefined && QLOO_TOOL_NAMES.has(tool);
  const inFlight = !row.result && running;
  const failed = row.result !== undefined && row.result.detail.startsWith("Error:");
  return (
    <li className="relative animate-step-in pb-5 pl-5">
      <Node tone={failed ? "error" : qloo ? "qloo" : "agent"} live={inFlight} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-mono text-xs text-bone-500" aria-hidden="true">
            {String(row.n).padStart(2, "0")}
          </span>
          <span className="font-display text-xl font-extrabold uppercase leading-6 tracking-wide text-bone-100">
            {toolTitle(tool)}
          </span>
          <Tag qloo={qloo} />
        </div>
        <span className="shrink-0 whitespace-nowrap font-mono text-xs leading-6 tabular-nums text-bone-300">
          {row.result?.durationMs !== undefined ? (
            formatDuration(row.result.durationMs)
          ) : inFlight ? (
            <span className="inline-flex items-center gap-2 text-tape-300">
              <LevelMeter className="h-3" bars={4} />
              In flight
            </span>
          ) : row.result ? null : (
            <span className="text-bone-500">No result</span>
          )}
        </span>
      </div>
      {row.thought && <p className="mt-1.5 break-words text-sm leading-snug text-bone-300">{row.thought.detail}</p>}
      <code className="mt-1.5 block break-words font-mono text-xs leading-5 text-bone-500">{row.call.detail}</code>
      {row.result && (
        <p
          className={`mt-1.5 flex gap-2 break-words border-l-2 py-0.5 pl-2.5 font-mono text-xs leading-5 ${
            failed ? "border-signal text-signal-400" : qloo ? "border-tape-400/70 text-bone-100" : "border-stage-600 text-bone-100"
          }`}
        >
          <span className="min-w-0 break-words">{row.result.detail}</span>
        </p>
      )}
    </li>
  );
}

export function ActivityPanel({ trace, running }: { trace: TraceStep[]; running: boolean }) {
  const rows = useMemo(() => buildRows(trace), [trace]);
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [detached, setDetached] = useState(false);

  const stats = useMemo(() => {
    let qlooCalls = 0;
    let toolMs = 0;
    for (const step of trace) {
      if (step.kind === "tool_call" && step.tool && QLOO_TOOL_NAMES.has(step.tool)) qlooCalls += 1;
      if (step.kind === "tool_result" && step.durationMs !== undefined) toolMs += step.durationMs;
    }
    return { qlooCalls, toolMs };
  }, [trace]);

  // Follow the newest step unless the reader has scrolled up to look at an earlier one.
  useEffect(() => {
    const list = listRef.current;
    if (trace.length === 0) {
      stickRef.current = true;
      setDetached(false);
      return;
    }
    if (list && stickRef.current) list.scrollTop = list.scrollHeight;
  }, [trace]);

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    const nearEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 56;
    stickRef.current = nearEnd;
    setDetached(!nearEnd);
  }

  function jumpToLatest() {
    const list = listRef.current;
    if (!list) return;
    stickRef.current = true;
    setDetached(false);
    list.scrollTop = list.scrollHeight;
  }

  const hasError = trace.some((step) => step.kind === "error");
  const state = running ? "Live" : trace.length === 0 ? "Idle" : hasError ? "Stopped" : "Done";

  return (
    <section
      aria-labelledby="activity-heading"
      className="relative flex max-h-[min(34rem,78vh)] flex-col overflow-hidden rounded-sm border border-stage-700 bg-stage-900 lg:max-h-[max(24rem,calc(100vh-12.5rem))]"
    >
      <header className="border-b border-stage-700 px-4 pb-3 pt-4 sm:px-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="activity-heading" className="display text-[1.75rem] text-bone-100">
              Agent activity
            </h2>
            <p className="mt-1.5 text-[0.8125rem] leading-snug text-bone-400">
              Each call the agent makes to Qloo, in order, with what came back.
            </p>
          </div>
          <span
            className={`caption mt-1 inline-flex shrink-0 items-center gap-2 border px-2 py-1 ${
              running
                ? "border-tape-400/60 text-tape-300"
                : state === "Stopped"
                  ? "border-signal/70 text-signal-400"
                  : "border-stage-600 text-bone-400"
            }`}
          >
            {running ? (
              <LevelMeter className="h-3.5" />
            ) : (
              <span
                className={`h-1.5 w-1.5 rounded-full ${state === "Stopped" ? "bg-signal" : state === "Done" ? "bg-bone-100" : "bg-stage-600"}`}
                aria-hidden="true"
              />
            )}
            {state}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-2 border border-stage-700 font-mono text-xs">
          <div className="flex items-baseline justify-between gap-2 border-r border-stage-700 px-2.5 py-1.5">
            <dt className="caption text-bone-500">Qloo calls</dt>
            <dd className="tabular-nums text-tape-300">{String(stats.qlooCalls).padStart(2, "0")}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2 px-2.5 py-1.5">
            <dt className="caption text-bone-500">Tool time</dt>
            <dd className="tabular-nums text-bone-100">{formatDuration(stats.toolMs)}</dd>
          </div>
        </dl>
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-5 py-12 text-center text-sm text-bone-400">
          {running && <LevelMeter className="h-5 text-tape-400" />}
          {running ? "Waiting for the first step." : "Activity appears here when a run starts."}
        </div>
      ) : (
        <div
          ref={listRef}
          onScroll={handleScroll}
          tabIndex={0}
          role="group"
          aria-label="Agent steps"
          className="scroll-quiet min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-1 pt-4 focus-visible:outline-offset-[-3px] sm:px-5"
        >
          <ol className="ml-[5px] border-l border-stage-600" aria-live="polite">
            {rows.map((row) => {
              if (row.type === "call") return <CallRow key={row.key} row={row} running={running} />;
              if (row.type === "thought") {
                return (
                  <li key={row.key} className="relative animate-step-in pb-5 pl-5">
                    <Node tone="agent" />
                    <span className="caption text-bone-500">Agent</span>
                    <p className="mt-1 break-words text-sm leading-snug text-bone-300">{row.step.detail}</p>
                  </li>
                );
              }
              if (row.type === "final") {
                return (
                  <li key={row.key} className="relative animate-step-in pb-5 pl-5">
                    <Node tone="done" />
                    <span className="caption text-bone-100">Accepted</span>
                    <p className="mt-1 break-words text-sm leading-snug text-bone-300">{row.step.detail}</p>
                  </li>
                );
              }
              if (row.type === "error") {
                return (
                  <li key={row.key} className="relative animate-step-in pb-5 pl-5">
                    <Node tone="error" />
                    <span className="caption text-signal-400">Error</span>
                    <p className="mt-1 break-words text-sm leading-snug text-signal-400">{row.step.detail}</p>
                  </li>
                );
              }
              return (
                <li key={row.key} className="relative animate-step-in pb-5 pl-5">
                  <Node tone="quiet" />
                  <span className="caption text-bone-500">{row.step.kind === "tool_result" ? "Result" : "Status"}</span>
                  <p className="mt-1 break-words text-sm leading-snug text-bone-300">{noteText(row.step)}</p>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {detached && rows.length > 0 && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="caption absolute bottom-3 left-1/2 inline-flex min-h-9 -translate-x-1/2 items-center gap-2 rounded-sm border border-bone-300 bg-stage-950 px-3 text-bone-100 shadow-lg transition-colors duration-150 hover:bg-stage-800"
        >
          {running && <LevelMeter className="h-3 text-tape-400" bars={3} />}
          Jump to latest
        </button>
      )}
    </section>
  );
}
