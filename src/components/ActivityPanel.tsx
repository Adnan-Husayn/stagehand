"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TraceStep } from "@/lib/types/stagehand";
import { QLOO_TOOL_NAMES } from "@/lib/client/stream";
import { Arrow, LiveDot } from "./Brand";

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

/** The arguments of a call, without the tool name that the row already shows. */
function callArgs(step: TraceStep): string {
  const prefix = step.tool ? `${step.tool}(` : "";
  if (prefix && step.detail.startsWith(prefix) && step.detail.endsWith(")")) {
    return step.detail.slice(prefix.length, -1);
  }
  return step.detail;
}

function Tag({ qloo }: { qloo: boolean }) {
  return qloo ? (
    <span className="bg-ink px-1.5 font-mono text-2xs font-semibold text-paper">Qloo API</span>
  ) : (
    <span className="font-mono text-2xs text-ink-3">agent tool</span>
  );
}

const ROW = "grid animate-row-in grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2 border-b border-rule py-3 last:border-b-0";

function CallRow({ row, running }: { row: Extract<Row, { type: "call" }>; running: boolean }) {
  const tool = row.call.tool;
  const qloo = tool !== undefined && QLOO_TOOL_NAMES.has(tool);
  const inFlight = !row.result && running;
  const failed = row.result !== undefined && row.result.detail.startsWith("Error:");
  const args = callArgs(row.call);
  return (
    <li className={ROW}>
      <span className="figure pt-px text-ink-3" aria-hidden="true">
        {String(row.n).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <code className="break-all font-mono text-sm font-semibold text-ink">{tool ?? "tool_call"}</code>
            <Tag qloo={qloo} />
          </div>
          <span className="figure shrink-0 whitespace-nowrap text-ink">
            {row.result?.durationMs !== undefined ? (
              formatDuration(row.result.durationMs)
            ) : inFlight ? (
              <span className="inline-flex items-center gap-1.5 bg-mark px-1.5">
                <LiveDot className="h-1.5 w-1.5" />
                running
              </span>
            ) : row.result ? null : (
              <span className="text-ink-3">no result</span>
            )}
          </span>
        </div>
        <p className="mt-1 break-words text-sm text-ink">{row.thought ? row.thought.detail : `${toolTitle(tool)}.`}</p>
        {args.length > 0 && <code className="figure mt-1 block break-words text-ink-3">{args}</code>}
        {row.result && (
          <p className={`figure mt-1 flex gap-2 break-words ${failed ? "text-stop" : "text-ink"}`}>
            <Arrow className="mt-[0.3125rem] h-2 w-3 shrink-0" />
            <span className="min-w-0 break-words">{row.result.detail}</span>
          </p>
        )}
      </div>
    </li>
  );
}

function NoteRow({ label, tone, children }: { label: string; tone: "quiet" | "done" | "error"; children: string }) {
  const color = tone === "error" ? "text-stop" : tone === "done" ? "text-ink" : "text-ink-2";
  return (
    <li className={ROW}>
      <span className={`figure pt-px ${tone === "error" ? "text-stop" : "text-ink-3"}`} aria-hidden="true">
        {tone === "done" ? (
          <svg viewBox="0 0 16 16" className="mt-0.5 h-3 w-3 text-ink" focusable="false">
            <path d="M2.5 8.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        ) : tone === "error" ? (
          "!"
        ) : null}
      </span>
      <p className={`min-w-0 break-words text-sm ${color}`}>
        <span className="font-semibold">{label}.</span> {children}
      </p>
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
      className="relative flex max-h-[min(34rem,78vh)] flex-col border-t-2 border-ink lg:max-h-[max(24rem,calc(100vh-11.5rem))]"
    >
      <header className="pb-3 pt-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="activity-heading" className="title text-lg">
            Agent activity
          </h2>
          {running ? (
            <span className="inline-flex items-center gap-2 bg-mark px-2 py-0.5 text-sm font-semibold text-ink">
              <LiveDot />
              {state}
            </span>
          ) : (
            <span className={`text-sm font-semibold ${state === "Stopped" ? "text-stop" : state === "Done" ? "text-ink" : "text-ink-3"}`}>
              {state}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-ink-2">Each call the agent makes to Qloo, in order, with what came back.</p>
        <dl className="figure mt-3 flex flex-wrap gap-x-6 gap-y-1">
          <div className="flex gap-2">
            <dt className="text-ink-3">Qloo calls</dt>
            <dd className="font-semibold text-ink">{stats.qlooCalls}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-3">Tool time</dt>
            <dd className="font-semibold text-ink">{formatDuration(stats.toolMs)}</dd>
          </div>
        </dl>
      </header>

      {rows.length === 0 ? (
        <p className="flex items-center gap-2.5 border-y border-rule py-6 text-sm text-ink-2">
          {running && <LiveDot />}
          {running ? "Waiting for the first step." : "Activity appears here when a run starts."}
        </p>
      ) : (
        <div
          ref={listRef}
          onScroll={handleScroll}
          tabIndex={0}
          role="group"
          aria-label="Agent steps"
          className="scroll-quiet min-h-0 flex-1 overflow-y-auto overscroll-contain border-y border-rule pr-3 focus-visible:outline-offset-[-2px]"
        >
          <ol aria-live="polite">
            {rows.map((row) => {
              if (row.type === "call") return <CallRow key={row.key} row={row} running={running} />;
              if (row.type === "thought") {
                return (
                  <NoteRow key={row.key} label="Agent" tone="quiet">
                    {row.step.detail}
                  </NoteRow>
                );
              }
              if (row.type === "final") {
                return (
                  <NoteRow key={row.key} label="Accepted" tone="done">
                    {row.step.detail}
                  </NoteRow>
                );
              }
              if (row.type === "error") {
                return (
                  <NoteRow key={row.key} label="Error" tone="error">
                    {row.step.detail}
                  </NoteRow>
                );
              }
              return (
                <NoteRow key={row.key} label={row.step.kind === "tool_result" ? "Result" : "Status"} tone="quiet">
                  {noteText(row.step)}
                </NoteRow>
              );
            })}
          </ol>
        </div>
      )}

      {detached && rows.length > 0 && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="btn-secondary absolute bottom-3 left-1/2 min-h-9 -translate-x-1/2 px-3 text-sm"
        >
          {running && <LiveDot />}
          Jump to latest
        </button>
      )}
    </section>
  );
}
