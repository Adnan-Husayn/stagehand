"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { VenueProfile } from "@/lib/types/stagehand";
import { Arrow } from "./Brand";
import { prefersReducedMotion } from "./motion";

const MAX_GENRES = 8;
const MAX_SEEDS = 5;

const SAMPLE = {
  venueName: "The Lantern Room",
  city: "Asheville, NC",
  capacity: "300",
  genres: "indie folk, dream pop, americana",
  seeds: ["Velvet Anchor", "Night Ferry"],
};

type FieldErrors = { city?: string; capacity?: string };

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function splitList(value: string, max: number): string[] {
  return parseList(value).slice(0, max);
}

function cityError(city: string): string | undefined {
  return city.trim().length < 2 ? "Enter the city the venue is in." : undefined;
}

function capacityError(capacity: string): string | undefined {
  const value = Number.parseInt(capacity, 10);
  return !Number.isInteger(value) || value < 20 || value > 5000
    ? "Capacity must be a whole number from 20 to 5000."
    : undefined;
}

function Field({
  id,
  label,
  note,
  help,
  error,
  className = "",
  children,
}: {
  id: string;
  label: string;
  note?: string;
  help?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="mb-[0.4rem] flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-base font-semibold">
          {label}
        </label>
        {note && <span className="whitespace-nowrap font-mono text-xs text-soft">{note}</span>}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-[0.4rem] text-sm font-semibold text-stop">
          {error}
        </p>
      ) : (
        help && (
          <p id={`${id}-help`} className="mt-[0.4rem] text-sm text-soft">
            {help}
          </p>
        )
      )}
    </div>
  );
}

export function VenueForm({
  disabled,
  onSubmit,
  showSample = false,
}: {
  disabled: boolean;
  onSubmit: (venue: VenueProfile) => void;
  showSample?: boolean;
}) {
  const [venueName, setVenueName] = useState("");
  const [city, setCity] = useState("");
  const [capacity, setCapacity] = useState("300");
  const [genres, setGenres] = useState("");
  const [seedList, setSeedList] = useState<string[]>([]);
  const [seedDraft, setSeedDraft] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const cityRef = useRef<HTMLInputElement>(null);
  const capacityRef = useRef<HTMLInputElement>(null);
  const seedRef = useRef<HTMLInputElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const capacityNumber = Number.parseInt(capacity, 10);
    const nextErrors: FieldErrors = {};
    const cityProblem = cityError(city);
    const capacityProblem = capacityError(capacity);
    if (cityProblem) nextErrors.city = cityProblem;
    if (capacityProblem) nextErrors.capacity = capacityProblem;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      (nextErrors.city ? cityRef : capacityRef).current?.focus();
      return;
    }
    onSubmit({
      venueName: venueName.trim(),
      city: city.trim(),
      capacity: capacityNumber,
      genres: splitList(genres, MAX_GENRES),
      seedArtists: [...seedList, ...parseList(seedDraft)].slice(0, MAX_SEEDS),
    });
  }

  function changeCity(value: string) {
    setCity(value);
    if (errors.city) setErrors((prev) => ({ ...prev, city: cityError(value) }));
  }

  function changeCapacity(value: string) {
    setCapacity(value);
    if (errors.capacity) setErrors((prev) => ({ ...prev, capacity: capacityError(value) }));
  }

  function fillSample() {
    setVenueName(SAMPLE.venueName);
    setCity(SAMPLE.city);
    setCapacity(SAMPLE.capacity);
    setGenres(SAMPLE.genres);
    setSeedList(SAMPLE.seeds);
    setSeedDraft("");
    setErrors({});
  }

  function addSeeds(names: string[]): number {
    const next = [...seedList, ...names].slice(0, MAX_SEEDS);
    if (names.length > 0) setSeedList(next);
    return next.length;
  }

  /** A comma ends a name. Whatever follows the last comma stays in the box while there is room. */
  function changeSeedDraft(value: string) {
    if (!value.includes(",")) {
      setSeedDraft(value);
      return;
    }
    const parts = value.split(",");
    const rest = parts.pop() ?? "";
    const count = addSeeds(parseList(parts.join(",")));
    setSeedDraft(count >= MAX_SEEDS ? "" : rest.trimStart());
  }

  function commitSeedDraft() {
    addSeeds(parseList(seedDraft));
    setSeedDraft("");
  }

  function handleSeedKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && seedDraft.trim().length > 0) {
      event.preventDefault();
      commitSeedDraft();
    } else if (event.key === "Backspace" && seedDraft.length === 0 && seedList.length > 0) {
      setSeedList((prev) => prev.slice(0, -1));
    }
  }

  function removeSeed(index: number) {
    setSeedList((prev) => prev.filter((_, i) => i !== index));
    seedRef.current?.focus();
  }

  /** The main button leans toward the pointer. */
  function leanToward(event: PointerEvent<HTMLButtonElement>) {
    const button = event.currentTarget;
    if (button.disabled || prefersReducedMotion() || event.pointerType === "touch") return;
    const box = button.getBoundingClientRect();
    const dx = (event.clientX - box.left - box.width / 2) * 0.18;
    const dy = (event.clientY - box.top - box.height / 2) * 0.3;
    button.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function settle(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.style.transform = "";
  }

  const genreCount = parseList(genres).length;
  const seedsFull = seedList.length >= MAX_SEEDS;

  return (
    <form onSubmit={handleSubmit} noValidate aria-labelledby="sheet-heading" aria-describedby="venue-form-help" className="desk">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="sheet-heading" className="title text-[1.9rem] italic">
          Your venue
        </h2>
        {showSample && (
          <button type="button" onClick={fillSample} className="link">
            Use the sample venue
          </button>
        )}
      </div>
      <p id="venue-form-help" className="mt-[0.35rem] text-ui text-soft">
        City and capacity are required. Genres and artists that sold well give the agent more to work with.
      </p>

      <div className="mt-[1.4rem] grid grid-cols-1 gap-x-4 gap-y-[1.15rem] sm:grid-cols-6">
        <Field id="venue-name" label="Venue name" note="Optional" className="sm:col-span-3">
          <input
            id="venue-name"
            className="input"
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            placeholder="The Lantern Room"
            maxLength={120}
            autoComplete="organization"
          />
        </Field>
        <Field id="venue-city" label="City" help="City and state or country." error={errors.city} className="sm:col-span-3">
          <input
            ref={cityRef}
            id="venue-city"
            className="input"
            value={city}
            onChange={(e) => changeCity(e.target.value)}
            placeholder="Asheville, NC"
            maxLength={80}
            aria-invalid={errors.city ? "true" : undefined}
            aria-describedby={errors.city ? "venue-city-error" : "venue-city-help"}
            required
          />
        </Field>

        <Field id="venue-capacity" label="Capacity" help="20 to 5000 people." error={errors.capacity} className="sm:col-span-2">
          <input
            ref={capacityRef}
            id="venue-capacity"
            className="input font-mono"
            value={capacity}
            onChange={(e) => changeCapacity(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={errors.capacity ? "true" : undefined}
            aria-describedby={errors.capacity ? "venue-capacity-error" : "venue-capacity-help"}
            required
          />
        </Field>
        <Field
          id="venue-genres"
          label="Typical genres"
          note="Optional"
          className="sm:col-span-4"
          help={
            genreCount > MAX_GENRES
              ? `Separate genres with commas. Stagehand uses the first ${MAX_GENRES}.`
              : "Separate genres with commas."
          }
        >
          <input
            id="venue-genres"
            className="input"
            value={genres}
            onChange={(e) => setGenres(e.target.value)}
            placeholder="indie folk, dream pop, americana"
            maxLength={300}
            aria-describedby="venue-genres-help"
          />
        </Field>

        <Field
          id="venue-seeds"
          label="Artists that sold well here"
          note={`${seedList.length} of ${MAX_SEEDS}`}
          className="sm:col-span-6"
          help={
            seedsFull
              ? `${MAX_SEEDS} is the limit. Remove an artist to add another.`
              : "Optional. Press Enter or type a comma after each name."
          }
        >
          <div className="seedbox">
            {seedList.length > 0 && (
              <ul className="contents" aria-label="Artists Stagehand will use">
                {seedList.map((seed, index) => (
                  <li
                    key={`${seed}-${index}`}
                    className="flex max-w-full animate-chip items-stretch rounded-full border border-key text-ui font-semibold text-key"
                  >
                    <span className="min-w-0 py-[0.3rem] pl-[0.8rem] pr-[0.2rem] [overflow-wrap:anywhere]">{seed}</span>
                    <button
                      type="button"
                      onClick={() => removeSeed(index)}
                      aria-label={`Remove ${seed}`}
                      className="grid w-8 shrink-0 place-items-center rounded-r-full hover:bg-key hover:text-key-ink"
                    >
                      <svg viewBox="0 0 12 12" className="h-[0.6rem] w-[0.6rem]" aria-hidden="true" focusable="false">
                        <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              ref={seedRef}
              id="venue-seeds"
              className="h-[2.2rem] min-w-[8.5rem] flex-1 bg-transparent px-[0.45rem] outline-none"
              value={seedDraft}
              onChange={(e) => changeSeedDraft(e.target.value)}
              onKeyDown={handleSeedKey}
              onBlur={commitSeedDraft}
              placeholder={seedList.length === 0 ? "Velvet Anchor, Night Ferry" : seedsFull ? "" : "Add another"}
              maxLength={400}
              readOnly={seedsFull}
              autoComplete="off"
              aria-describedby="venue-seeds-help"
            />
          </div>
        </Field>
      </div>

      <div className="mt-[1.6rem] flex flex-col gap-[0.9rem] sm:flex-row sm:items-center sm:gap-5">
        <button
          type="submit"
          disabled={disabled}
          onPointerMove={leanToward}
          onPointerLeave={settle}
          className="btn btn-primary"
        >
          Build shortlist
          <Arrow />
        </button>
        <p className="text-ui text-soft">Each Qloo call shows as it runs.</p>
      </div>
    </form>
  );
}
