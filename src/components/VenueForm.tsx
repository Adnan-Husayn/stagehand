"use client";

import { useState, type FormEvent } from "react";
import type { VenueProfile } from "@/lib/types/stagehand";

function splitList(value: string, max: number): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .slice(0, max);
}

export function VenueForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (venue: VenueProfile) => void }) {
  const [venueName, setVenueName] = useState("");
  const [city, setCity] = useState("");
  const [capacity, setCapacity] = useState("300");
  const [genres, setGenres] = useState("");
  const [seeds, setSeeds] = useState("");
  const [errors, setErrors] = useState<{ city?: string; capacity?: string }>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const capacityNumber = Number.parseInt(capacity, 10);
    const nextErrors: { city?: string; capacity?: string } = {};
    if (city.trim().length < 2) nextErrors.city = "Enter the city the venue is in.";
    if (!Number.isInteger(capacityNumber) || capacityNumber < 20 || capacityNumber > 5000) {
      nextErrors.capacity = "Capacity must be a whole number from 20 to 5000.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit({
      venueName: venueName.trim(),
      city: city.trim(),
      capacity: capacityNumber,
      genres: splitList(genres, 8),
      seedArtists: splitList(seeds, 5),
    });
  }

  const inputClass =
    "w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2.5 text-ink-100 placeholder:text-ink-500 focus:border-ember-400 focus:outline-none";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5" aria-describedby="venue-form-help">
      <p id="venue-form-help" className="text-sm text-ink-300">
        Tell Stagehand where your room is. Genres and seed artists give the agent more to work with.
      </p>

      <div>
        <label htmlFor="venue-name" className="mb-1.5 block text-sm font-medium text-ink-100">
          Venue name <span className="font-normal text-ink-500">(optional)</span>
        </label>
        <input
          id="venue-name"
          className={inputClass}
          value={venueName}
          onChange={(e) => setVenueName(e.target.value)}
          placeholder="The Lantern Room"
          maxLength={120}
          autoComplete="organization"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_140px]">
        <div>
          <label htmlFor="venue-city" className="mb-1.5 block text-sm font-medium text-ink-100">
            City
          </label>
          <input
            id="venue-city"
            className={inputClass}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Asheville, NC"
            maxLength={80}
            aria-invalid={errors.city ? "true" : undefined}
            aria-describedby={errors.city ? "venue-city-error" : undefined}
            required
          />
          {errors.city && (
            <p id="venue-city-error" className="mt-1.5 text-sm text-ember-400">
              {errors.city}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="venue-capacity" className="mb-1.5 block text-sm font-medium text-ink-100">
            Capacity
          </label>
          <input
            id="venue-capacity"
            className={inputClass}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            inputMode="numeric"
            aria-invalid={errors.capacity ? "true" : undefined}
            aria-describedby={errors.capacity ? "venue-capacity-error" : undefined}
            required
          />
          {errors.capacity && (
            <p id="venue-capacity-error" className="mt-1.5 text-sm text-ember-400">
              {errors.capacity}
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="venue-genres" className="mb-1.5 block text-sm font-medium text-ink-100">
          Typical genres <span className="font-normal text-ink-500">(comma separated)</span>
        </label>
        <input
          id="venue-genres"
          className={inputClass}
          value={genres}
          onChange={(e) => setGenres(e.target.value)}
          placeholder="indie folk, dream pop, americana"
          maxLength={300}
        />
      </div>

      <div>
        <label htmlFor="venue-seeds" className="mb-1.5 block text-sm font-medium text-ink-100">
          Artists that sold well here <span className="font-normal text-ink-500">(up to 5, comma separated)</span>
        </label>
        <input
          id="venue-seeds"
          className={inputClass}
          value={seeds}
          onChange={(e) => setSeeds(e.target.value)}
          placeholder="Velvet Anchor, Night Ferry"
          maxLength={400}
        />
        <p className="mt-1.5 text-xs text-ink-500">Seeds are optional. Stagehand uses them to find fans who overlap.</p>
      </div>

      <button
        type="submit"
        disabled={disabled}
        className="inline-flex w-full items-center justify-center rounded-lg bg-ember-500 px-5 py-3 font-semibold text-ink-950 transition hover:bg-ember-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        Build shortlist
      </button>
    </form>
  );
}
