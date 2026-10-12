"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
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
import { Arrow, BrandMark, LiveDot } from "./Brand";
import { DemoBanner } from "./DemoBanner";
import { prefersReducedMotion } from "./motion";
import { PromoDetail } from "./PromoDetail";
import { StageCanvas, type StageRig } from "./StageCanvas";
import { VenueForm } from "./VenueForm";

type View = "input" | "results" | "detail";

const MAX_TRACE_STEPS = 300;

/** Blackout timing: lights down, the scene changes in the dark, lights up. */
const DARK_MS = 280;
const HOLD_MS = 140;

/** Which beam answers which tool. Anything else (the submit tools) uses the last one. */
const BEAM_FOR_TOOL: Record<string, number> = {
  resolve_city: 1,
  find_local_places: 1,
  search_entities: 2,
  get_insights: 3,
  compare_audiences: 3,
  get_location_insights: 3,
};

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

/** One mask per word, so a headline can rise word by word and still wrap. */
function Words({ text, from }: { text: string; from: number }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((word, index) => (
        <Fragment key={index}>
          {index > 0 && " "}
          <span className="w" aria-hidden="true">
            <i style={{ "--n": from + index } as CSSProperties}>{word}</i>
          </span>
        </Fragment>
      ))}
    </>
  );
}

function SkeletonLineup() {
  return (
    <div className="mt-6 grid gap-[1.1rem]" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="ghost h-[8.5rem]" style={{ "--i": i } as CSSProperties} />
      ))}
    </div>
  );
}

function SkeletonPlan() {
  return (
    <div aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="ghost mt-5 h-28" style={{ "--i": i } as CSSProperties} />
      ))}
    </div>
  );
}

function RunningNote({ children }: { children: string }) {
  return (
    <p className="flex items-baseline gap-[0.7rem] text-lit" role="status">
      <LiveDot className="-translate-y-px" />
      {children}
    </p>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="fade-up rounded-md border border-stop/60 bg-panel/95 p-5">
      <p className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-stop">Run stopped</p>
      <p className="mt-2 font-display text-[1.6rem] font-medium italic leading-[1.1]">Stagehand could not finish this run.</p>
      <p className="mt-2 max-w-[62ch] break-words text-lit">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-primary mt-5">
          Try again
        </button>
      )}
    </div>
  );
}

function ProgressSteps({ view }: { view: View }) {
  const current = STEPS.findIndex((step) => step.view === view);
  return (
    <ol className="hidden gap-7 text-ui text-lit md:flex" aria-label="Progress">
      {STEPS.map((step, index) => {
        const active = index === current;
        return (
          <li
            key={step.view}
            className={`flex items-baseline gap-2 ${active ? "font-semibold text-key" : ""}`}
            aria-current={active ? "step" : undefined}
          >
            <span className="font-mono text-xs font-normal">{index + 1}</span>
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
  const [dark, setDark] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownView = useRef<View>("input");
  const rigRef = useRef<StageRig | null>(null);
  // The view on screen right now, kept in step with `view` for use inside timers.
  const onScreen = useRef<View>("input");
  const timers = useRef<number[]>([]);
  const pendingSwap = useRef<(() => void) | null>(null);
  const blackedOut = useRef(false);

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

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    },
    [],
  );

  // On load the room starts dark. Once the fonts are in, the lamps strike and the page comes up.
  useEffect(() => {
    const root = document.documentElement;
    let done = false;
    let cancelled = false;
    const ids: number[] = [];
    const ready = () => {
      if (done) return;
      done = true;
      root.classList.add("is-ready");
      rigRef.current?.strike(140);
    };
    if (prefersReducedMotion()) {
      ready();
    } else {
      const fonts = document.fonts?.ready ?? Promise.resolve();
      void fonts.then(() => {
        if (!cancelled) ids.push(window.setTimeout(ready, 120));
      });
      ids.push(window.setTimeout(ready, 1400));
    }
    return () => {
      cancelled = true;
      ids.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  // A soft sheen follows the pointer across the form and the tickets.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const host = event.target instanceof Element ? event.target.closest<HTMLElement>(".desk, .ticket") : null;
      if (!host) return;
      const box = host.getBoundingClientRect();
      host.style.setProperty("--mx", `${event.clientX - box.left}px`);
      host.style.setProperty("--my", `${event.clientY - box.top}px`);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);

  // Each view starts at the top of the page with its heading focused.
  useEffect(() => {
    if (shownView.current === view) return;
    shownView.current = view;
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [view]);

  // When the shortlist lands, the follow spot settles on the first ticket.
  useEffect(() => {
    if (view !== "results" || !shortlist) return;
    const first = document.querySelector(".ticket");
    if (!first) return;
    const box = first.getBoundingClientRect();
    rigRef.current?.aim(box.left + box.width * 0.3, box.top + box.height / 2);
  }, [view, shortlist]);

  function clearTimers() {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }

  /** A swap that is still waiting for the dark runs now, so a new action never leaves state behind. */
  function settleTransition() {
    clearTimers();
    pendingSwap.current?.();
  }

  function liftBlackout() {
    if (!blackedOut.current) return;
    blackedOut.current = false;
    setDark(false);
    rigRef.current?.strike(90);
  }

  /**
   * Moves to another view behind a blackout. The outgoing view stays mounted until the middle of
   * the dark; `commit` runs with the swap. With reduced motion the swap is immediate.
   */
  function goTo(next: View, commit?: () => void) {
    settleTransition();
    const swap = () => {
      pendingSwap.current = null;
      onScreen.current = next;
      setView(next);
      commit?.();
    };
    if (prefersReducedMotion() || onScreen.current === next) {
      swap();
      liftBlackout();
      return;
    }
    pendingSwap.current = swap;
    blackedOut.current = true;
    setDark(true);
    rigRef.current?.cut();
    timers.current.push(
      window.setTimeout(() => {
        swap();
        timers.current.push(window.setTimeout(liftBlackout, HOLD_MS));
      }, DARK_MS),
    );
  }

  async function run(request: StartRequest, onResult: (data: ShortlistResult | PromoPlan) => void) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLastRequest(request);
    setRunning(true);
    setError(null);
    setTrace([]);
    rigRef.current?.search(true);
    let received = false;
    let results = 0;
    try {
      await streamAgent(
        request,
        (event) => {
          if (event.type === "trace") {
            setTrace((prev) => [...prev, event.step].slice(-MAX_TRACE_STEPS));
            // The beams answer each tool call and each result.
            if (event.step.kind === "tool_call") {
              rigRef.current?.pulse((event.step.tool && BEAM_FOR_TOOL[event.step.tool]) || 4);
            } else if (event.step.kind === "tool_result") {
              rigRef.current?.pulse(results);
              results += 1;
            }
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
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        rigRef.current?.search(false);
        if (!controller.signal.aborted) rigRef.current?.pulse(2);
      }
      setRunning(false);
    }
  }

  function startShortlist(next: VenueProfile) {
    if (pendingSwap.current) return;
    setVenue(next);
    setShortlist(null);
    setPromo(null);
    setSelected(null);
    goTo("results");
    void run({ mode: "shortlist", venue: next }, (data) => {
      if (data.mode === "shortlist") setShortlist(data);
    });
  }

  function startPromo(artist: ShortlistArtist) {
    if (!venue || pendingSwap.current) return;
    setSelected(artist);
    setPromo(null);
    goTo("detail");
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
    controllerRef.current = null;
    rigRef.current?.search(false);
    goTo("input", () => {
      setShortlist(null);
      setPromo(null);
      setSelected(null);
      setError(null);
      setTrace([]);
      setRunning(false);
    });
  }

  const demo = status?.demo ?? false;
  const venueLine = venue
    ? [venue.venueName, venue.city, `Capacity ${venue.capacity}`].filter((part) => part.length > 0)
    : [];
  const count = shortlist?.artists.length ?? 0;
  return (
    <div className="flex min-h-screen flex-col">
      <StageCanvas rigRef={rigRef} />
      <div className="grain" aria-hidden="true" />
      <div className="blackout" data-on={dark} aria-hidden="true" />
      <a className="skip" href="#main">
        Skip to content
      </a>

      <header className="intro intro-bar relative z-[2] flex items-center justify-between gap-4 bg-room/[0.86] px-pad py-[1.1rem]">
        <button
          type="button"
          onClick={startOver}
          className="inline-flex items-center gap-[0.65rem] font-display text-[1.6rem] font-medium italic leading-none tracking-[-0.01em]"
          aria-label="Stagehand home"
        >
          <BrandMark />
          Stagehand
        </button>
        <ProgressSteps view={view} />
        {status && (
          <span className="inline-flex shrink-0 items-baseline whitespace-nowrap rounded-full border border-field px-[0.7rem] py-[0.45rem] font-mono text-xs font-medium uppercase leading-none tracking-[0.04em]">
            {demo ? (
              "Demo mode"
            ) : (
              <>
                Live<span className="hidden xl:inline">&nbsp;/ Qloo and a language model</span>
              </>
            )}
          </span>
        )}
      </header>

      <DemoBanner visible={demo} />

      <main
        id="main"
        className="relative z-[2] mx-auto w-full max-w-shell flex-1 px-pad pb-20 pt-[clamp(1.75rem,4vw,3.5rem)]"
      >
        {view === "input" && (
          <section aria-labelledby="start-heading">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:items-start lg:gap-x-[clamp(2.5rem,5vw,5rem)]">
              <div className="min-w-0 lg:col-start-1 lg:row-start-1">
                <h1
                  id="start-heading"
                  ref={headingRef}
                  tabIndex={-1}
                  aria-label="Shortlist artists for your venue, then plan the promotion."
                  className="display"
                >
                  <Words text="Shortlist artists for your venue," from={0} />{" "}
                  <em>
                    <Words text="then plan the promotion." from={5} />
                  </em>
                </h1>
                <p className="intro intro-lede mt-6 max-w-[34rem] text-lead text-lit">
                  Stagehand ranks artists for your city from Qloo taste data and shows the evidence behind each pick.
                </p>
              </div>

              <div className="intro intro-desk min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-3">
                <VenueForm disabled={running} onSubmit={startShortlist} showSample={demo} />
              </div>

              <div className="intro intro-how min-w-0 lg:col-start-1 lg:row-start-2 lg:self-end">
                <h2 id="how-heading" className="label leading-none tracking-[0.14em]">
                  How a run goes
                </h2>
                <ol aria-labelledby="how-heading" className="mt-4 grid gap-6 sm:grid-cols-3">
                  {HOW_IT_RUNS.map((step, index) => (
                    <li key={step.title} className="border-t border-hair pt-[0.9rem]">
                      <span
                        className="mb-2 block font-display text-[2.6rem] italic leading-none text-key"
                        aria-hidden="true"
                      >
                        {index + 1}
                      </span>
                      <p className="font-semibold">{step.title}</p>
                      <p className="mt-[0.3rem] text-base text-lit">{step.body}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>
        )}

        {view !== "input" && (
          <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:grid-rows-[auto_1fr] lg:gap-x-[clamp(2rem,4vw,3.75rem)] lg:gap-y-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="min-w-0 lg:col-start-1 lg:row-start-1">
              {view === "results" && (
                <div className="fade-up">
                  <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                    <p className="min-w-0 text-ui text-lit">{venueLine.join(" / ")}</p>
                    <button type="button" onClick={startOver} className="btn btn-ghost">
                      Change venue
                    </button>
                  </div>
                  <h1 id="results-heading" ref={headingRef} tabIndex={-1} className="display display-work">
                    Shortlist for <em>{venue?.city}</em>
                  </h1>
                  {shortlist?.localityName && (
                    <p className="mt-[0.8rem] font-mono text-sm text-lit">Resolved to {shortlist.localityName} in Qloo.</p>
                  )}
                </div>
              )}

              {view === "detail" && selected && (
                <div className="fade-up">
                  <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                    <p className="min-w-0 text-ui text-lit">{["Promo plan", ...venueLine].join(" / ")}</p>
                    <button type="button" onClick={() => goTo("results")} className="btn btn-ghost btn-back">
                      <Arrow direction="left" />
                      Back to shortlist
                    </button>
                  </div>
                  <h1
                    id="detail-heading"
                    ref={headingRef}
                    tabIndex={-1}
                    className="display display-work italic text-warm"
                  >
                    {selected.name}
                  </h1>
                </div>
              )}
            </div>

            <div className={`min-w-0 lg:col-start-1 lg:row-start-2 ${running ? "order-3 lg:order-none" : ""}`}>
              {view === "results" && (
                <section aria-labelledby="results-heading">
                  {error && <ErrorPanel message={error} onRetry={!running ? retry : undefined} />}

                  {!shortlist && !error && (
                    <div>
                      <RunningNote>Building the shortlist. Each Qloo call shows in the activity panel as it runs.</RunningNote>
                      <SkeletonLineup />
                    </div>
                  )}

                  {shortlist && (
                    <div className={error ? "mt-6" : ""}>
                      <div className="fade-up">
                        <p className="label">Agent summary</p>
                        <p className="mt-[0.45rem] max-w-[44rem] text-md">{shortlist.summary}</p>
                      </div>

                      {count === 0 ? (
                        <p className="mt-8 border-t border-hair pt-3 text-base text-soft">
                          The agent returned no artists. Try a larger city or add artists that sold well for you.
                        </p>
                      ) : (
                        <>
                          <div className="fade-up mt-8 flex items-baseline justify-between border-b border-hair pb-[0.6rem]">
                            <p className="label">The shortlist</p>
                            <p className="label">
                              {count} {count === 1 ? "artist" : "artists"}, ranked
                            </p>
                          </div>
                          <ol className="mt-5 grid gap-[1.1rem]">
                            {shortlist.artists.map((artist, index) => (
                              <li key={artist.entityId} style={{ "--i": index } as CSSProperties}>
                                <ArtistCard artist={artist} onSelect={startPromo} total={count} />
                              </li>
                            ))}
                          </ol>
                        </>
                      )}
                    </div>
                  )}
                </section>
              )}

              {view === "detail" && selected && (
                <section aria-labelledby="detail-heading">
                  {error && <ErrorPanel message={error} onRetry={!running ? retry : undefined} />}

                  {!promo && !error && (
                    <div>
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
              className="min-w-0 lg:sticky lg:top-5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start"
            >
              <ActivityPanel trace={trace} running={running} />
            </aside>
          </div>
        )}
      </main>

      <footer className="relative z-[2] border-t border-hair bg-room">
        <div className="flex flex-wrap justify-between gap-x-8 gap-y-1 px-pad py-5 text-ui text-soft">
          <p>Stagehand is an open-source hackathon project. Review every draft before you send it.</p>
          <p>Taste data from Qloo</p>
        </div>
      </footer>
    </div>
  );
}
