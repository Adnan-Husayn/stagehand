"use client";

import { useEffect, useRef, useState } from "react";
import { streamAgent } from "@/lib/client/stream";
import type {
  AppStatus,
  PromoPlan,
  ShortlistArtist,
  ShortlistResult,
  StartRequest,
  TraceStep,
  VenueProfile,
} from "@/lib/types/stagehand";
import { ActivityPanel } from "./ActivityPanel";
import { ArtistCard } from "./ArtistCard";
import { Arrow, LevelMeter, SpikeMark } from "./Brand";
import { DemoBanner } from "./DemoBanner";
import { PromoDetail } from "./PromoDetail";
import { VenueForm } from "./VenueForm";

type View = "input" | "results" | "detail";

const MAX_TRACE_STEPS = 300;

const HEADING_SIZE = "text-[clamp(2.5rem,8.5vw,4.25rem)]";

const STEPS: { view: View; label: string }[] = [
  { view: "input", label: "Venue" },
  { view: "results", label: "Shortlist" },
  { view: "detail", label: "Promo plan" },
];

const HOW_IT_RUNS = [
  {
    title: "Fill in the booking sheet",
    body: "Your city and capacity, plus up to five artists that sold well in your room.",
  },
  {
    title: "Watch the agent work",
    body: "It resolves your city, finds local live-music spots and asks Qloo which artists over-index with those audiences. Every call shows as it runs.",
  },
  {
    title: "Pick an artist",
    body: "Stagehand builds a promo plan with partners, ad audiences and two draft emails you can copy.",
  },
];

function SkeletonTickets() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[1, 2, 3, 4].map((rank) => (
        <div
          key={rank}
          className="ticket grid grid-cols-[4.5rem_minmax(0,1fr)] bg-stage-850 sm:grid-cols-[7rem_minmax(0,1fr)]"
          style={{ opacity: 1 - (rank - 1) * 0.2 }}
        >
          <div className="flex flex-col items-center border-r border-dashed border-stage-600 pb-4 pt-5 sm:pt-6">
            <span className="caption text-bone-500">Rank</span>
            <span className="display mt-1 text-[3.25rem] text-stage-600 sm:text-[5rem]">{String(rank).padStart(2, "0")}</span>
          </div>
          <div className="shimmer-dark space-y-3 px-4 py-6 sm:px-7">
            <div className="h-8 w-3/5 max-w-xs bg-stage-700" />
            <div className="h-3 w-full max-w-md bg-stage-800" />
            <div className="h-3 w-4/5 max-w-sm bg-stage-800" />
            <div className="flex gap-2 pt-2">
              <div className="h-6 w-28 bg-stage-800" />
              <div className="h-6 w-20 bg-stage-800" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonPlan() {
  return (
    <div className="paper shadow-sheet" aria-hidden="true">
      {["Partners", "Ad audiences", "Booking inquiry"].map((title, index) => (
        <div
          key={title}
          className={`px-5 pb-9 pt-5 sm:px-9 ${index === 0 ? "" : "border-t-2 border-ink-900/40"}`}
          style={{ opacity: 1 - index * 0.25 }}
        >
          <div className="flex items-baseline gap-3 sm:gap-4">
            <span className="display text-3xl text-ink-900/25 sm:text-4xl">{String(index + 1).padStart(2, "0")}</span>
            <span className="display text-3xl text-ink-900/35 sm:text-4xl">{title}</span>
          </div>
          <div className="shimmer-paper mt-6 space-y-3">
            <div className="h-6 w-1/2 max-w-xs bg-ink-900/10" />
            <div className="h-3 w-full max-w-lg bg-ink-900/10" />
            <div className="h-3 w-4/5 max-w-md bg-ink-900/10" />
            <div className="h-3 w-2/3 max-w-sm bg-ink-900/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RunningNote({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-3 text-[0.9375rem] leading-snug text-bone-300" role="status">
      <LevelMeter className="h-4 shrink-0 text-tape-400" />
      {children}
    </p>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="animate-view-in border border-signal/60 border-l-4 border-l-signal bg-stage-900 px-5 py-5">
      <p className="caption text-signal-400">Run stopped</p>
      <p className="mt-2 text-lg font-semibold text-bone-100">Stagehand could not finish this run.</p>
      <p className="mt-1.5 break-words text-[0.9375rem] leading-relaxed text-bone-300">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn-signal mt-5 min-h-11 px-5 text-lg hover:bg-signal-400"
        >
          Try again
        </button>
      )}
    </div>
  );
}

function ProgressSteps({ view }: { view: View }) {
  const current = STEPS.findIndex((step) => step.view === view);
  return (
    <ol className="hidden items-center gap-3 md:flex" aria-label="Progress">
      {STEPS.map((step, index) => {
        const active = index === current;
        const done = index < current;
        return (
          <li key={step.view} className="flex items-center gap-3" aria-current={active ? "step" : undefined}>
            {index > 0 && <span className={`h-px w-6 ${done || active ? "bg-bone-400" : "bg-stage-600"}`} aria-hidden="true" />}
            <span
              className={`caption flex items-center gap-2 ${active ? "text-bone-100" : done ? "text-bone-400" : "text-bone-500"}`}
            >
              <span className={active ? "text-signal-400" : undefined}>{String(index + 1).padStart(2, "0")}</span>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function StagehandApp() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [view, setView] = useState<View>("input");
  const [venue, setVenue] = useState<VenueProfile | null>(null);
  const [shortlist, setShortlist] = useState<ShortlistResult | null>(null);
  const [selected, setSelected] = useState<ShortlistArtist | null>(null);
  const [promo, setPromo] = useState<PromoPlan | null>(null);
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<StartRequest | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownView = useRef<View>("input");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/status")
      .then((res) => res.json() as Promise<AppStatus>)
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        // Status is cosmetic; the app still works without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  // Each view starts at the top of the page with its heading focused.
  useEffect(() => {
    if (shownView.current === view) return;
    shownView.current = view;
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [view]);

  async function run(request: StartRequest, onResult: (data: ShortlistResult | PromoPlan) => void) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLastRequest(request);
    setRunning(true);
    setError(null);
    setTrace([]);
    let received = false;
    try {
      await streamAgent(
        request,
        (event) => {
          if (event.type === "trace") {
            setTrace((prev) => [...prev, event.step].slice(-MAX_TRACE_STEPS));
          } else if (event.type === "result") {
            received = true;
            onResult(event.data);
          } else if (event.type === "error") {
            setError(event.message);
          }
        },
        controller.signal,
      );
      if (!received && !controller.signal.aborted) {
        setError((prev) => prev ?? "The run ended without a result. Try again.");
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setRunning(false);
    }
  }

  function startShortlist(next: VenueProfile) {
    setVenue(next);
    setShortlist(null);
    setPromo(null);
    setSelected(null);
    setView("results");
    void run({ mode: "shortlist", venue: next }, (data) => {
      if (data.mode === "shortlist") setShortlist(data);
    });
  }

  function startPromo(artist: ShortlistArtist) {
    if (!venue) return;
    setSelected(artist);
    setPromo(null);
    setView("detail");
    void run({ mode: "promo", venue, artist: { entityId: artist.entityId, name: artist.name } }, (data) => {
      if (data.mode === "promo") setPromo(data);
    });
  }

  function retry() {
    if (!lastRequest) return;
    if (lastRequest.mode === "shortlist") {
      void run(lastRequest, (data) => {
        if (data.mode === "shortlist") setShortlist(data);
      });
    } else {
      void run(lastRequest, (data) => {
        if (data.mode === "promo") setPromo(data);
      });
    }
  }

  function startOver() {
    controllerRef.current?.abort();
    setView("input");
    setShortlist(null);
    setPromo(null);
    setSelected(null);
    setError(null);
    setTrace([]);
    setRunning(false);
  }

  const demo = status?.demo ?? false;
  const venueLine = venue
    ? [venue.venueName, venue.city, `Capacity ${venue.capacity}`].filter((part) => part.length > 0)
    : [];
  const headingClass = "display break-words text-bone-100 outline-none";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-stage-700">
        <div className="mx-auto flex max-w-shell items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={startOver}
            className="flex items-center gap-3 rounded-sm text-left"
            aria-label="Stagehand home"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-stage-600 bg-stage-900">
              <SpikeMark className="h-9 w-9" />
            </span>
            <span className="min-w-0">
              <span className="display block text-[1.75rem] text-bone-100">Stagehand</span>
              <span className="caption mt-0.5 hidden text-bone-500 lg:block">Booking and promotion for independent venues</span>
            </span>
          </button>
          <div className="flex items-center gap-6">
            <ProgressSteps view={view} />
            {status && (
              <span
                className={`caption inline-flex shrink-0 items-center gap-2 border px-2.5 py-1.5 ${
                  demo ? "border-bone-400 text-bone-100" : "border-tape-400/60 text-tape-300"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${demo ? "bg-bone-400" : "bg-tape-400"}`} aria-hidden="true" />
                {demo ? (
                  "Demo mode"
                ) : (
                  <>
                    Live<span className="hidden xl:inline"> / Qloo and a language model</span>
                  </>
                )}
              </span>
            )}
          </div>
        </div>
      </header>

      <DemoBanner visible={demo} />

      <main className="mx-auto w-full max-w-shell flex-1 px-4 pb-16 pt-8 sm:px-6 lg:px-8 lg:pt-12">
        {view === "input" && (
          <section
            key="input"
            aria-labelledby="start-heading"
            className="relative grid animate-view-in gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,31rem)] lg:grid-rows-[auto_1fr] lg:gap-x-14 xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] xl:gap-x-20"
          >
            <div className="halftone pointer-events-none absolute -top-12 right-0 hidden h-80 w-[36rem] lg:block" aria-hidden="true" />

            <div className="relative lg:col-start-1 lg:row-start-1 lg:pt-4">
              <p className="caption flex items-center gap-3 text-bone-400">
                <span className="h-px w-8 bg-signal" aria-hidden="true" />
                Taste data from Qloo
              </p>
              <h1
                id="start-heading"
                ref={headingRef}
                tabIndex={-1}
                className={`${headingClass} mt-5 text-[clamp(3rem,13.5vw,4.5rem)] lg:text-[clamp(4rem,6.6vw,6.75rem)]`}
              >
                Book the acts <span className="text-signal">your city</span> already has a taste for.
              </h1>
              <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-bone-300">
                Stagehand asks Qloo which artists over-index with the crowds at live-music spots in your city and with
                fans of acts that sold well for you. You get a ranked shortlist with the evidence behind each pick, then
                a promo plan for the artist you choose.
              </p>
            </div>

            <div className="relative lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <span
                className="absolute -top-3 left-8 z-10 h-7 w-24 -rotate-3 bg-paper-300/80 shadow-sm"
                aria-hidden="true"
              />
              <span
                className="absolute -top-3 right-10 z-10 h-7 w-20 rotate-2 bg-paper-300/80 shadow-sm"
                aria-hidden="true"
              />
              <div className="paper shadow-sheet">
                <VenueForm disabled={running} onSubmit={startShortlist} showSample={demo} />
              </div>
            </div>

            <div className="relative lg:col-start-1 lg:row-start-2">
              <h2 className="caption text-bone-400">How a run goes</h2>
              <ol className="mt-3 max-w-[34rem] border-b border-stage-700">
                {HOW_IT_RUNS.map((step, index) => (
                  <li key={step.title} className="flex gap-4 border-t border-stage-700 py-4 sm:gap-5">
                    <span className="display w-11 shrink-0 text-4xl text-signal" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="font-display text-2xl font-extrabold uppercase leading-7 tracking-wide text-bone-100">
                        {step.title}
                      </p>
                      <p className="mt-1 text-[0.9375rem] leading-relaxed text-bone-400">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        {view !== "input" && (
          <div
            key={view}
            className="grid animate-view-in gap-x-8 gap-y-7 lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:grid-rows-[auto_1fr] xl:grid-cols-[minmax(0,1fr)_26rem] xl:gap-x-12"
          >
            <div className="min-w-0 lg:col-start-1 lg:row-start-1">
              {view === "results" && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                    <p className="caption min-w-0 text-bone-400">{venueLine.join(" / ")}</p>
                    <button type="button" onClick={startOver} className="btn-ghost">
                      Change venue
                    </button>
                  </div>
                  <h1 id="results-heading" ref={headingRef} tabIndex={-1} className={`${headingClass} mt-4 ${HEADING_SIZE}`}>
                    Shortlist for {venue?.city}
                  </h1>
                  {shortlist?.localityName && (
                    <p className="mt-3 flex items-center gap-2 font-mono text-xs text-bone-400">
                      <span className="h-2 w-2 shrink-0 bg-tape-400" aria-hidden="true" />
                      Resolved to {shortlist.localityName} in Qloo.
                    </p>
                  )}
                </div>
              )}

              {view === "detail" && selected && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                    <p className="caption min-w-0 text-bone-400">{["Promo plan", ...venueLine].join(" / ")}</p>
                    <button type="button" onClick={() => setView("results")} className="btn-ghost">
                      <Arrow className="h-2.5 w-4" direction="left" />
                      Back to shortlist
                    </button>
                  </div>
                  <h1 id="detail-heading" ref={headingRef} tabIndex={-1} className={`${headingClass} mt-4 ${HEADING_SIZE}`}>
                    {selected.name}
                  </h1>
                </div>
              )}
            </div>

            <div className={`min-w-0 lg:col-start-1 lg:row-start-2 ${running ? "order-3 lg:order-none" : ""}`}>
              {view === "results" && (
                <section aria-labelledby="results-heading" className="space-y-6">
                  {error && <ErrorPanel message={error} onRetry={!running ? retry : undefined} />}

                  {!shortlist && !error && (
                    <div className="space-y-5">
                      <RunningNote>Building the shortlist. Each Qloo call shows in the activity panel as it runs.</RunningNote>
                      <SkeletonTickets />
                    </div>
                  )}

                  {shortlist && (
                    <div className="animate-rise border-l-2 border-signal pl-4 sm:pl-5">
                      <p className="caption text-bone-400">Agent summary</p>
                      <p className="mt-1.5 max-w-[68ch] text-[1.0625rem] leading-relaxed text-bone-100">{shortlist.summary}</p>
                    </div>
                  )}

                  {shortlist && shortlist.artists.length === 0 && (
                    <p className="border border-stage-700 bg-stage-900 px-5 py-5 text-[0.9375rem] leading-relaxed text-bone-300">
                      The agent returned no artists. Try a larger city or add artists that sold well for you.
                    </p>
                  )}

                  {shortlist && shortlist.artists.length > 0 && (
                    <>
                      <p className="caption flex items-center gap-3 text-bone-400">
                        {shortlist.artists.length} {shortlist.artists.length === 1 ? "artist" : "artists"}, ranked
                        <span className="h-px flex-1 bg-stage-700" aria-hidden="true" />
                      </p>
                      <ol className="space-y-3">
                        {shortlist.artists.map((artist, index) => (
                          <li
                            key={artist.entityId}
                            className="animate-rise transition-transform duration-200 hover:-translate-y-0.5"
                            style={{ animationDelay: `${80 + index * 90}ms` }}
                          >
                            <ArtistCard artist={artist} onSelect={startPromo} total={shortlist.artists.length} />
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </section>
              )}

              {view === "detail" && selected && (
                <section aria-labelledby="detail-heading" className="space-y-6">
                  {error && <ErrorPanel message={error} onRetry={!running ? retry : undefined} />}

                  {!promo && !error && (
                    <div className="space-y-5">
                      <RunningNote>Building the promo plan from cross-domain Qloo insights and drafting outreach.</RunningNote>
                      <SkeletonPlan />
                    </div>
                  )}

                  {promo && <PromoDetail plan={promo} />}
                </section>
              )}
            </div>

            <aside
              aria-label="Agent activity"
              className="min-w-0 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start"
            >
              <ActivityPanel trace={trace} running={running} />
            </aside>
          </div>
        )}
      </main>

      <footer className="border-t border-stage-700">
        <div className="mx-auto flex max-w-shell flex-wrap items-center justify-between gap-x-8 gap-y-2 px-4 py-6 text-[0.8125rem] leading-relaxed text-bone-500 sm:px-6 lg:px-8">
          <p>Stagehand is an open-source hackathon project. Review every draft before you send it.</p>
          <p className="caption">Taste data from Qloo</p>
        </div>
      </footer>
    </div>
  );
}
