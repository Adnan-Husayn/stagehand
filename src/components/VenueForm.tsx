"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import type { VenueProfile } from "@/lib/types/stagehand";
import { Arrow } from "./Brand";

const MAX_GENRES = 8;
const MAX_SEEDS = 5;

const SAMPLE = {
  venueName: "The Lantern Room",
  city: "Asheville, NC",
  capacity: "300",
  genres: "indie folk, dream pop, americana",
  seeds: "Velvet Anchor, Night Ferry",
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
  tag,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  tag: string;
  help?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[0.9375rem] font-semibold text-ink-900">
          {label}
        </label>
        <span className="caption shrink-0 text-ink-500">{tag}</span>
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-2 text-sm font-medium text-signal-700">
          <span
            className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center bg-signal-700 font-mono text-[0.6875rem] font-medium leading-none text-paper-50"
            aria-hidden="true"
          >
            !
          </span>
          {error}
        </p>
      ) : (
        help && (
          <p id={`${id}-help`} className="mt-1.5 text-[0.8125rem] leading-snug text-ink-500">
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
  const [seeds, setSeeds] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const cityRef = useRef<HTMLInputElement>(null);
  const capacityRef = useRef<HTMLInputElement>(null);

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
      seedArtists: splitList(seeds, MAX_SEEDS),
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
    setSeeds(SAMPLE.seeds);
    setErrors({});
  }

  const seedList = parseList(seeds);
  const genreCount = parseList(genres).length;

  const inputBase =
    "block h-12 w-full min-w-0 rounded-sm border border-b-2 bg-paper-50 px-3 text-base text-ink-900 placeholder:text-ink-400 transition-colors duration-150 focus:bg-white";
  const inputOk = `${inputBase} border-ink-900/30 border-b-ink-900/70 hover:border-ink-900/50 hover:border-b-ink-900 focus:border-ink-900`;
  const inputBad = `${inputBase} border-signal-700 border-b-signal-700`;

  return (
    <form onSubmit={handleSubmit} noValidate aria-labelledby="sheet-heading" aria-describedby="venue-form-help">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-3 border-b-2 border-ink-900 px-5 pb-4 pt-7 sm:px-8">
        <div>
          <p className="caption text-ink-500">Step 01 / Venue details</p>
          <h2 id="sheet-heading" className="display mt-1 text-[2.5rem] text-ink-900 sm:text-5xl">
            Booking sheet
          </h2>
        </div>
        {showSample && (
          <button
            type="button"
            onClick={fillSample}
            className="caption inline-flex min-h-10 items-center rounded-sm border border-ink-900 bg-paper-50 px-3 text-ink-900 shadow-press-sm transition duration-150 hover:-translate-x-px hover:-translate-y-px hover:shadow-press active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Fill in the sample venue
          </button>
        )}
      </div>

      <div className="space-y-6 px-5 pb-7 pt-5 sm:px-8">
        <p id="venue-form-help" className="text-[0.9375rem] leading-relaxed text-ink-700">
          Tell Stagehand where your room is. Genres and artists that sold well give the agent more to work with.
        </p>

        <Field id="venue-name" label="Venue name" tag="Optional">
          <input
            id="venue-name"
            className={inputOk}
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            placeholder="The Lantern Room"
            maxLength={120}
            autoComplete="organization"
          />
        </Field>

        <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_9.5rem]">
          <Field id="venue-city" label="City" tag="Required" help="City and state or country." error={errors.city}>
            <input
              ref={cityRef}
              id="venue-city"
              className={errors.city ? inputBad : inputOk}
              value={city}
              onChange={(e) => changeCity(e.target.value)}
              placeholder="Asheville, NC"
              maxLength={80}
              aria-invalid={errors.city ? "true" : undefined}
              aria-describedby={errors.city ? "venue-city-error" : "venue-city-help"}
              required
            />
          </Field>
          <Field id="venue-capacity" label="Capacity" tag="Required" help="20 to 5000 people." error={errors.capacity}>
            <input
              ref={capacityRef}
              id="venue-capacity"
              className={`${errors.capacity ? inputBad : inputOk} font-mono`}
              value={capacity}
              onChange={(e) => changeCapacity(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={errors.capacity ? "true" : undefined}
              aria-describedby={errors.capacity ? "venue-capacity-error" : "venue-capacity-help"}
              required
            />
          </Field>
        </div>

        <Field
          id="venue-genres"
          label="Typical genres"
          tag="Optional"
          help={
            genreCount > MAX_GENRES
              ? `Separate genres with commas. Stagehand uses the first ${MAX_GENRES}.`
              : "Separate genres with commas."
          }
        >
          <input
            id="venue-genres"
            className={inputOk}
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
          tag={`${Math.min(seedList.length, MAX_SEEDS)} of ${MAX_SEEDS}`}
          help={
            seedList.length > MAX_SEEDS
              ? `Stagehand uses the first ${MAX_SEEDS} artists.`
              : "Optional. Separate artists with commas. Stagehand looks for acts their fans also follow."
          }
        >
          <input
            id="venue-seeds"
            className={inputOk}
            value={seeds}
            onChange={(e) => setSeeds(e.target.value)}
            placeholder="Velvet Anchor, Night Ferry"
            maxLength={400}
            aria-describedby="venue-seeds-help"
          />
          {seedList.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Artists Stagehand will use">
              {seedList.slice(0, MAX_SEEDS).map((seed, index) => (
                <li
                  key={`${seed}-${index}`}
                  className="max-w-full break-words border border-ink-900/25 bg-paper-200 px-2 py-0.5 font-mono text-xs leading-5 text-ink-900"
                >
                  {seed}
                </li>
              ))}
            </ul>
          )}
        </Field>
      </div>

      <div className="tear-line h-[2px]" aria-hidden="true" />

      <div className="px-5 py-6 sm:px-8">
        <button
          type="submit"
          disabled={disabled}
          className="btn-signal min-h-14 w-full px-6 text-2xl shadow-press hover:-translate-x-px hover:-translate-y-px hover:shadow-[6px_6px_0_#17130e] active:translate-x-1 active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          Build shortlist
          <Arrow className="h-3.5 w-6" />
        </button>
      </div>
    </form>
  );
}
