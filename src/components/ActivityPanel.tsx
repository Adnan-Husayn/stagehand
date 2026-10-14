"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TraceStep } from "@/lib/types/stagehand";
import { QLOO_TOOL_NAMES } from "@/lib/client/stream";
import { Arrow, CheckIcon, LiveDot } from "./Brand";

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
    <span className="whitespace-nowrap rounded-[3px] border border-beam/50 px-[0.3rem] font-mono text-2xs text-beam">
      Qloo API
    </span>
  ) : (
    <span className="whitespace-nowrap font-mono text-2xs text-soft">agent tool</span>
  );
}

const ROW =
  "cue relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2 border-b border-hair px-5 py-[0.8rem]";

function CallRow({ row, running }: { row: Extract<Row, { type: "call" }>; running: boolean }) {
  const tool = row.call.tool;
  const qloo = tool !== undefined && QLOO_TOOL_NAMES.has(tool);
  const inFlight = !row.result && running;
  const failed = row.result !== undefined && row.result.detail.startsWith("Error:");
  const args = callArgs(row.call);
  return (
    <li className={`call ${ROW}`} data-state={inFlight ? "running" : "done"}>
      <span className="font-mono text-sm leading-[1.6] text-soft" aria-hidden="true">
        {String(row.n).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <code className="break-all font-mono text-ui font-medium">{tool ?? "tool_call"}</code>
            <Tag qloo={qloo} />
          </div>
          <span className="whitespace-nowrap font-mono text-sm">
            {row.result?.durationMs !== undefined ? (
              formatDuration(row.result.durationMs)
            ) : inFlight ? (
              <span className="inline-flex items-center gap-[0.4rem] text-key">
                <LiveDot className="h-[0.375rem] w-[0.375rem]" />
                running
              </span>
            ) : row.result ? null : (
              <span className="text-soft">no result</span>
            )}
          </span>
        </div>
        <p className="mt-1 break-words text-ui leading-[1.45]">{row.thought ? row.thought.detail : `${toolTitle(tool)}.`}</p>
        {args.length > 0 && (
          <code className="mt-1 block break-words font-mono text-xs leading-normal text-soft [overflow-wrap:anywhere]">
            {args}
          </code>
        )}
        {row.result && (
          <p
            className={`mt-[0.3rem] flex gap-2 break-words font-mono text-sm leading-normal [overflow-wrap:anywhere] ${
              failed ? "text-stop" : "text-warm"
            }`}
          >
            <Arrow className="mt-[0.42rem] h-2 w-3 shrink-0" />
            <span className="min-w-0 break-words">{row.result.detail}</span>
          </p>
        )}
      </div>
    </li>
  );
}

function NoteRow({ label, tone, children }: { label: string; tone: "quiet" | "done" | "error"; children: string }) {
  const color = tone === "error" ? "text-stop" : tone === "done" ? "text-ink" : "text-soft";
  return (
    <li className={`anote ${ROW}`}>
      <span className={`font-mono text-sm leading-[1.6] ${tone === "error" ? "text-stop" : "text-soft"}`} aria-hidden="true">
        {tone === "done" ? <CheckIcon className="mt-[0.3rem] h-[0.8rem] w-[0.8rem] text-key" /> : tone === "error" ? "!" : null}
      </span>
      <p className={`min-w-0 break-words text-ui ${color}`}>
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
  // "Running" rather than "Live": the header's "Live mode" badge is about where the data comes
  // from, and this is about whether a run is going. Using one word for both made them disagree.
  const state = running ? "Running" : trace.length === 0 ? "Idle" : hasError ? "Stopped" : "Done";

  return (
    <section
      aria-labelledby="activity-heading"
      data-state={state.toLowerCase()}
      className="act relative flex max-h-[26rem] min-w-0 flex-col rounded-md border border-hair bg-panel/95 lg:max-h-[max(24rem,calc(100vh-11.5rem))]"
    >
      <header className="border-b border-hair px-5 pb-[0.95rem] pt-[1.1rem]">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="activity-heading" className="title text-[1.6rem] italic">
            Agent activity
          </h2>
          <span
            className={`inline-flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-[0.08em] ${
              running ? "text-key" : state === "Stopped" ? "text-stop" : state === "Done" ? "text-ink" : "text-soft"
            }`}
          >
            {running && <LiveDot />}
            {state}
          </span>
        </div>
        <p className="mt-[0.3rem] text-ui text-soft">Each call the agent makes to Qloo, in order, with what came back.</p>
        <dl className="mt-[0.7rem] flex flex-wrap gap-x-6 gap-y-1 font-mono text-sm">
          <div className="flex gap-2">
            <dt className="text-soft">Qloo calls</dt>
            <dd>{stats.qlooCalls}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-soft">Tool time</dt>
            <dd>{formatDuration(stats.toolMs)}</dd>
          </div>
        </dl>
      </header>

      {rows.length === 0 ? (
        <p className="flex items-center gap-[0.7rem] px-5 py-6 text-ui text-soft">
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
          className="act-scroll min-h-0 flex-1 overflow-y-auto focus-visible:outline-offset-[-2px]"
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

      {/* Only while new steps are still arriving, and only once the reader has scrolled up. It sits
          at the left so it never lands on the list's scrollbar. */}
      {running && detached && rows.length > 0 && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="btn btn-ghost absolute bottom-3 left-5 min-h-9 bg-raised px-3 text-ui"
        >
          <LiveDot />
          Jump to latest
        </button>
      )}
    </section>
  );
}
