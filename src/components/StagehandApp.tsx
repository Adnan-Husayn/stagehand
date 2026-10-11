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
import { ArtistCard, LINEUP_GRID } from "./ArtistCard";
import { Arrow, LineupMark, LiveDot } from "./Brand";
import { DemoBanner } from "./DemoBanner";
import { PromoDetail } from "./PromoDetail";
import { VenueForm } from "./VenueForm";

type View = "input" | "results" | "detail";

const MAX_TRACE_STEPS = 300;

const PAGE_TITLE = "title break-words text-2xl outline-none sm:text-3xl xl:text-4xl";

const STEPS: { view: View; label: string }[] = [
  { view: "input", label: "Venue" },
  { view: "results", label: "Shortlist" },
  { view: "detail", label: "Promo plan" },
];

const HOW_IT_RUNS = [
  {
    title: "Fill in your venue",
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

function LineupHeader({ count }: { count?: number }) {
  return (
    <div className={`${LINEUP_GRID} items-baseline border-b border-ink pb-2 text-sm text-ink-3`} aria-hidden="true">
      <span>No.</span>
      <span className="flex items-baseline justify-between gap-4">
        Artist
        {count !== undefined && (
          <span className="xl:hidden">
            {count} {count === 1 ? "artist" : "artists"}, ranked
          </span>
        )}
      </span>
      <span className="hidden items-baseline justify-between gap-4 xl:flex">
        Evidence from Qloo
        {count !== undefined && (
          <span>
            {count} {count === 1 ? "artist" : "artists"}, ranked
          </span>
        )}
      </span>
    </div>
  );
}

function SkeletonLineup() {
  return (
    <div aria-hidden="true">
      <LineupHeader />
      {[1, 2, 3, 4].map((rank) => (
        <div key={rank} className={`${LINEUP_GRID} border-b border-rule py-6`}>
          <span className="title text-lg text-rule sm:text-xl">{rank}</span>
          <div className="animate-wait space-y-3 pt-1" style={{ animationDelay: `${rank * 120}ms` }}>
            <div className="h-6 w-3/5 max-w-xs bg-wash" />
            <div className="h-3 w-full max-w-md bg-wash" />
            <div className="h-3 w-4/5 max-w-sm bg-wash" />
          </div>
          <div className="hidden animate-wait space-y-3 pt-2 xl:block" style={{ animationDelay: `${rank * 120}ms` }}>
            <div className="h-3 w-full bg-wash" />
            <div className="h-3 w-full bg-wash" />
            <div className="h-3 w-2/3 bg-wash" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonPlan() {
  return (
    <div aria-hidden="true">
      {["Partners", "Ad audiences", "Booking inquiry"].map((title, index) => (
        <div key={title} className="border-t-2 border-rule pb-12 pt-3">
          <p className="title text-lg text-ink-3">{title}</p>
          <div className="mt-5 animate-wait space-y-3" style={{ animationDelay: `${index * 160}ms` }}>
            <div className="h-5 w-1/2 max-w-xs bg-wash" />
            <div className="h-3 w-full max-w-lg bg-wash" />
            <div className="h-3 w-4/5 max-w-md bg-wash" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RunningNote({ children }: { children: string }) {
  return (
    <p className="flex items-baseline gap-2.5 text-base text-ink-2" role="status">
      <LiveDot className="translate-y-[-1px]" />
      {children}
    </p>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="animate-view-in border-t-2 border-stop pt-3">
      <p className="text-sm font-semibold text-stop">Run stopped</p>
      <p className="title mt-2 text-lg">Stagehand could not finish this run.</p>
      <p className="mt-1.5 max-w-[62ch] break-words text-base text-ink-2">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-primary mt-5">
          Try again
        </button>
      )}
    </div>
  );
}

function ProgressSteps({ view }: { view: View }) {
  const current = STEPS.findIndex((step) => step.view === view);
  return (
    <ol className="hidden items-baseline gap-5 text-sm md:flex" aria-label="Progress">
      {STEPS.map((step, index) => {
        const active = index === current;
        return (
          <li
            key={step.view}
            className={`flex items-baseline gap-1.5 ${active ? "font-semibold text-ink" : "text-ink-3"}`}
            aria-current={active ? "step" : undefined}
          >
            <span className="figure font-normal">{index + 1}</span>
            {step.label}
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
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-ink">
        <div className="shell flex min-h-14 items-center justify-between gap-4 py-2">
          <button type="button" onClick={startOver} className="flex items-center gap-2.5 rounded text-left" aria-label="Stagehand home">
            <LineupMark className="h-5 w-5 shrink-0" />
            <span className="title text-lg">Stagehand</span>
          </button>
          <div className="flex items-baseline gap-7">
            <ProgressSteps view={view} />
            {status && (
              <span className="inline-flex shrink-0 items-baseline gap-2 border border-ink px-2 py-0.5 font-mono text-xs font-semibold text-ink">
                {demo ? (
                  "Demo mode"
                ) : (
                  <>
                    Live<span className="hidden font-normal xl:inline"> / Qloo and a language model</span>
                  </>
                )}
              </span>
            )}
          </div>
        </div>
      </header>

      <DemoBanner visible={demo} />

      <main className="shell flex-1 pb-20 pt-8 lg:pt-10">
        {view === "input" && (
          <section
            key="input"
            aria-labelledby="start-heading"
            className="grid animate-view-in gap-y-14 lg:grid-cols-[minmax(0,40rem)_minmax(0,1fr)_19rem] lg:gap-x-10"
          >
            <div className="min-w-0">
              <h1 id="start-heading" ref={headingRef} tabIndex={-1} className="title break-words text-2xl outline-none sm:text-3xl">
                Shortlist artists for your venue, then plan the promotion.
              </h1>
              <p className="mt-4 text-md text-ink-2">
                Stagehand ranks artists for your city from Qloo taste data and shows the evidence behind each pick.
              </p>
              <div className="mt-8">
                <VenueForm disabled={running} onSubmit={startShortlist} showSample={demo} />
              </div>
            </div>

            <div className="min-w-0 lg:col-start-3 lg:pt-2">
              <h2 className="title border-t-2 border-ink pt-3 text-lg">How a run goes</h2>
              <ol className="mt-3">
                {HOW_IT_RUNS.map((step, index) => (
                  <li key={step.title} className="grid grid-cols-[1.75rem_minmax(0,1fr)] border-t border-rule py-4">
                    <span className="figure pt-0.5 text-ink-3" aria-hidden="true">
                      {index + 1}
                    </span>
                    <div>
                      <p className="label">{step.title}</p>
                      <p className="mt-1 text-sm text-ink-2">{step.body}</p>
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
            className="grid animate-view-in gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_21.5rem] lg:grid-rows-[auto_1fr] xl:grid-cols-[minmax(0,1fr)_24rem] xl:gap-x-16"
          >
            <div className="min-w-0 lg:col-start-1 lg:row-start-1">
              {view === "results" && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                    <p className="min-w-0 text-sm text-ink-2">{venueLine.join(" / ")}</p>
                    <button type="button" onClick={startOver} className="btn-secondary min-h-9 px-3 text-sm">
                      Change venue
                    </button>
                  </div>
                  <h1 id="results-heading" ref={headingRef} tabIndex={-1} className={`${PAGE_TITLE} mt-5`}>
                    Shortlist for {venue?.city}
                  </h1>
                  {shortlist?.localityName && (
                    <p className="figure mt-3 text-ink-3">Resolved to {shortlist.localityName} in Qloo.</p>
                  )}
                </div>
              )}

              {view === "detail" && selected && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                    <p className="min-w-0 text-sm text-ink-2">{["Promo plan", ...venueLine].join(" / ")}</p>
                    <button type="button" onClick={() => setView("results")} className="btn-secondary min-h-9 px-3 text-sm">
                      <Arrow className="h-2.5 w-4" direction="left" />
                      Back to shortlist
                    </button>
                  </div>
                  <h1 id="detail-heading" ref={headingRef} tabIndex={-1} className={`${PAGE_TITLE} mt-5`}>
                    {selected.name}
                  </h1>
                </div>
              )}
            </div>

            <div className={`min-w-0 lg:col-start-1 lg:row-start-2 ${running ? "order-3 lg:order-none" : ""}`}>
              {view === "results" && (
                <section aria-labelledby="results-heading" className="space-y-8">
                  {error && <ErrorPanel message={error} onRetry={!running ? retry : undefined} />}

                  {!shortlist && !error && (
                    <div className="space-y-8">
                      <RunningNote>Building the shortlist. Each Qloo call shows in the activity panel as it runs.</RunningNote>
                      <SkeletonLineup />
                    </div>
                  )}

                  {shortlist && (
                    <div className="animate-view-in">
                      <p className="label">Agent summary</p>
                      <p className="mt-1 max-w-[64ch] text-md text-ink">{shortlist.summary}</p>
                    </div>
                  )}

                  {shortlist && shortlist.artists.length === 0 && (
                    <p className="border-t border-ink pt-3 text-base text-ink-2">
                      The agent returned no artists. Try a larger city or add artists that sold well for you.
                    </p>
                  )}

                  {shortlist && shortlist.artists.length > 0 && (
                    <div>
                      <LineupHeader count={shortlist.artists.length} />
                      <p className="sr-only">
                        {shortlist.artists.length} {shortlist.artists.length === 1 ? "artist" : "artists"}, ranked
                      </p>
                      <ol>
                        {shortlist.artists.map((artist, index) => (
                          <li key={artist.entityId} className="animate-row-in" style={{ animationDelay: `${index * 40}ms` }}>
                            <ArtistCard artist={artist} onSelect={startPromo} total={shortlist.artists.length} />
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </section>
              )}

              {view === "detail" && selected && (
                <section aria-labelledby="detail-heading" className="space-y-8">
                  {error && <ErrorPanel message={error} onRetry={!running ? retry : undefined} />}

                  {!promo && !error && (
                    <div className="space-y-8">
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

      <footer className="border-t border-rule">
        <div className="shell flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 py-5 text-sm text-ink-3">
          <p>Stagehand is an open-source hackathon project. Review every draft before you send it.</p>
          <p>Taste data from Qloo</p>
        </div>
      </footer>
    </div>
  );
}
