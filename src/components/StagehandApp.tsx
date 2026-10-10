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
import { DemoBanner } from "./DemoBanner";
import { PromoDetail } from "./PromoDetail";
import { VenueForm } from "./VenueForm";

type View = "input" | "results" | "detail";

const MAX_TRACE_STEPS = 300;

function SkeletonCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-56 animate-pulse rounded-2xl border border-ink-800 bg-ink-900" />
      ))}
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-ember-500/40 bg-ember-500/10 p-5">
      <p className="font-semibold text-ember-400">Stagehand could not finish this run.</p>
      <p className="mt-1 text-sm text-ink-300">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400"
        >
          Try again
        </button>
      )}
    </div>
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

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={startOver}
            className="flex items-center gap-3 rounded-lg text-left focus-visible:outline-offset-4"
            aria-label="Stagehand home"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ember-500 font-bold text-ink-950">S</span>
            <span>
              <span className="block text-base font-semibold text-ink-100">Stagehand</span>
              <span className="block text-xs text-ink-500">Booking and promotion for independent venues</span>
            </span>
          </button>
          {status && (
            <span className="hidden rounded-full border border-ink-700 px-3 py-1 text-xs text-ink-300 sm:inline">
              {demo ? "Demo mode" : `Live · ${status.model}`}
            </span>
          )}
        </div>
      </header>

      <DemoBanner visible={demo} />

      <main
        className={`mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:py-10 ${
          view === "input" ? "" : "lg:grid-cols-[minmax(0,1fr)_380px]"
        }`}
      >
        <div className="min-w-0">
          {view === "input" && (
            <section aria-labelledby="start-heading" className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="max-w-2xl">
                <p className="text-sm font-medium uppercase tracking-widest text-ember-400">Booking and promotion, powered by Qloo</p>
                <h1 id="start-heading" className="mt-3 text-3xl font-bold leading-tight text-ink-100 sm:text-4xl">
                  Know which touring acts will sell in your town before you book them.
                </h1>
                <p className="mt-4 leading-relaxed text-ink-300">
                  Stagehand reads Qloo&apos;s taste graph for your city. It ranks artists whose audiences over-index where you
                  are, then builds a cross-domain promo plan from the brands, places, podcasts and films those fans already
                  follow.
                </p>
                <ol className="mt-8 space-y-4 text-sm text-ink-300">
                  <li className="flex gap-3">
                    <span className="font-mono text-ember-400">01</span>
                    Tell Stagehand your city and, optionally, artists that sold well for you.
                  </li>
                  <li className="flex gap-3">
                    <span className="font-mono text-ember-400">02</span>
                    An agent makes Qloo calls to find local signals and over-indexing artists, and shows each call.
                  </li>
                  <li className="flex gap-3">
                    <span className="font-mono text-ember-400">03</span>
                    Pick an artist to get partners, ad audiences and drafted outreach emails.
                  </li>
                </ol>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-900 p-6 sm:p-8">
                <VenueForm disabled={running} onSubmit={startShortlist} />
              </div>
            </section>
          )}

          {view === "results" && (
            <section aria-labelledby="results-heading" className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-ink-500">
                    {venue?.venueName ? `${venue.venueName} · ` : ""}
                    {venue?.city} · capacity {venue?.capacity}
                  </p>
                  <h1 id="results-heading" className="mt-1 text-2xl font-bold text-ink-100 sm:text-3xl">
                    Shortlist of artists to book
                  </h1>
                  {shortlist?.localityName && (
                    <p className="mt-1 text-sm text-ink-500">Resolved to {shortlist.localityName} in Qloo.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={startOver}
                  className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-100 transition hover:border-ink-500"
                >
                  Change venue
                </button>
              </div>

              {shortlist && <p className="rounded-xl border border-ink-800 bg-ink-900 p-4 text-sm leading-relaxed text-ink-300">{shortlist.summary}</p>}

              {error && <ErrorPanel message={error} onRetry={!running ? retry : undefined} />}

              {!shortlist && !error && (
                <div className="space-y-4">
                  <p className="text-sm text-ink-300" role="status">
                    Building the shortlist. This takes a while as the agent works through Qloo.
                  </p>
                  <SkeletonCards />
                </div>
              )}

              {shortlist && shortlist.artists.length === 0 && (
                <p className="text-sm text-ink-300">The agent returned no artists. Try a larger city or add seed artists.</p>
              )}

              {shortlist && shortlist.artists.length > 0 && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {shortlist.artists.map((artist) => (
                    <ArtistCard key={artist.entityId} artist={artist} onSelect={startPromo} />
                  ))}
                </div>
              )}
            </section>
          )}

          {view === "detail" && selected && (
            <section aria-labelledby="detail-heading" className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-ink-500">Promo plan for {venue?.city}</p>
                  <h1 id="detail-heading" className="mt-1 text-2xl font-bold text-ink-100 sm:text-3xl">
                    {selected.name}
                  </h1>
                </div>
                <button
                  type="button"
                  onClick={() => setView("results")}
                  className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-100 transition hover:border-ink-500"
                >
                  Back to shortlist
                </button>
              </div>

              {error && <ErrorPanel message={error} onRetry={!running ? retry : undefined} />}

              {!promo && !error && (
                <div className="space-y-4">
                  <p className="text-sm text-ink-300" role="status">
                    Building the promo plan from cross-domain Qloo insights and drafting outreach.
                  </p>
                  <SkeletonCards />
                </div>
              )}

              {promo && <PromoDetail plan={promo} />}
            </section>
          )}
        </div>

        {view !== "input" && (
          <aside aria-label="Agent activity" className="lg:sticky lg:top-6 lg:self-start">
            <ActivityPanel trace={trace} running={running} />
          </aside>
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-ink-500 sm:px-6">
        Stagehand is an open-source hackathon project. Review every draft before you send it.
      </footer>
    </div>
  );
}
