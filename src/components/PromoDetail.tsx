"use client";

import type { PromoPlan } from "@/lib/types/stagehand";
import { CopyButton } from "./CopyButton";
import { EvidenceChips } from "./EvidenceChips";

const KIND_LABEL: Record<string, string> = {
  brand: "Brand",
  place: "Place",
  podcast: "Podcast",
  movie: "Film",
  tv_show: "TV show",
  artist: "Artist",
};

const PLATFORM_LABEL: Record<string, string> = {
  meta: "Meta (Facebook and Instagram)",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  spotify: "Spotify",
  google: "Google Search and Display",
  podcast_ads: "Podcast ads",
  local_radio: "Local radio",
  other: "Other",
};

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink-800 bg-ink-900 p-6">
      <h2 className="text-lg font-semibold text-ink-100">{title}</h2>
      {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function PromoDetail({ plan }: { plan: PromoPlan }) {
  const bookingText = `Subject: ${plan.bookingEmail.subject}\n\n${plan.bookingEmail.body}`;
  const pitchText = `Subject: ${plan.partnerPitch.subject}\n\n${plan.partnerPitch.body}`;

  return (
    <div className="space-y-6">
      <Section
        title="Cross-domain partners"
        description="Brands, places, podcasts and films that this artist's fans over-index on, from Qloo's cross-domain insights."
      >
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {plan.partners.map((partner) => (
            <li key={partner.entityId} className="rounded-xl border border-ink-800 bg-ink-950 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ember-400">
                {KIND_LABEL[partner.kind] ?? partner.kind}
              </p>
              <h3 className="mt-1 font-semibold text-ink-100">{partner.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-300">{partner.angle}</p>
              <div className="mt-3">
                <EvidenceChips chips={partner.evidence} />
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Ad targeting" description="Audiences to target, each tied to the Qloo results it comes from.">
        <ul className="space-y-3">
          {plan.adTargeting.map((target, index) => (
            <li key={`${target.platform}-${index}`} className="rounded-xl border border-ink-800 bg-ink-950 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-tide-400">
                {PLATFORM_LABEL[target.platform] ?? target.platform}
              </p>
              <p className="mt-1 font-medium text-ink-100">{target.audience}</p>
              <p className="mt-2 text-sm text-ink-300">{target.rationale}</p>
              <p className="mt-3 text-xs text-ink-500">
                Based on:{" "}
                {target.basedOn.map((b) => b.name).join(", ")}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Booking inquiry to the artist's agent"
        description="A draft. Replace the [placeholders] with real facts before sending."
      >
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm font-medium text-ink-100">{plan.bookingEmail.subject}</p>
          <CopyButton text={bookingText} label="booking inquiry" />
        </div>
        <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-ink-800 bg-ink-950 p-4 font-sans text-sm leading-relaxed text-ink-300">
          {plan.bookingEmail.body}
        </pre>
      </Section>

      <Section
        title="Partner pitch"
        description={`A short pitch to ${plan.partnerPitch.partnerName}, one of the partners above.`}
      >
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm font-medium text-ink-100">{plan.partnerPitch.subject}</p>
          <CopyButton text={pitchText} label="partner pitch" />
        </div>
        <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-ink-800 bg-ink-950 p-4 font-sans text-sm leading-relaxed text-ink-300">
          {plan.partnerPitch.body}
        </pre>
      </Section>
    </div>
  );
}
