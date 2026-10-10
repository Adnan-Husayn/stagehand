"use client";

import { Fragment, type ReactNode } from "react";
import type { EmailDraft, PromoPartner, PromoPlan } from "@/lib/types/stagehand";
import { CopyButton } from "./CopyButton";
import { EvidenceChips } from "./EvidenceChips";

const KIND_ORDER = ["brand", "place", "podcast", "movie", "tv_show", "artist"];

const KIND_LABEL: Record<string, { one: string; many: string }> = {
  brand: { one: "Brand", many: "Brands" },
  place: { one: "Place", many: "Places" },
  podcast: { one: "Podcast", many: "Podcasts" },
  movie: { one: "Film", many: "Films" },
  tv_show: { one: "TV show", many: "TV shows" },
  artist: { one: "Artist", many: "Artists" },
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

function groupPartners(partners: PromoPartner[]): { kind: string; items: PromoPartner[] }[] {
  const kinds = [...KIND_ORDER];
  for (const partner of partners) {
    if (!kinds.includes(partner.kind)) kinds.push(partner.kind);
  }
  return kinds
    .map((kind) => ({ kind, items: partners.filter((partner) => partner.kind === kind) }))
    .filter((group) => group.items.length > 0);
}

function kindHeading(kind: string, count: number): string {
  const label = KIND_LABEL[kind];
  if (!label) return kind;
  return count === 1 ? label.one : label.many;
}

function formatGenerated(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function Section({
  number,
  id,
  title,
  description,
  children,
}: {
  number: string;
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t-2 border-ink-900 px-5 pb-9 pt-5 sm:px-9 sm:pb-11 sm:pt-6">
      <div className="flex items-baseline gap-3 sm:gap-4">
        <span className="display text-3xl text-signal-600 sm:text-4xl" aria-hidden="true">
          {number}
        </span>
        <h2 id={id} className="display text-3xl text-ink-900 sm:text-4xl">
          {title}
        </h2>
      </div>
      {description && <p className="mt-2.5 max-w-[66ch] text-[0.9375rem] leading-relaxed text-ink-700">{description}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** Draft text with each [placeholder] marked so it is easy to find and replace. */
function DraftBody({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]\n]+\])/g);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="bg-signal/15 px-0.5 text-ink-900 underline decoration-signal-700 decoration-dotted decoration-2 underline-offset-4">
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function Letter({ to, draft, copyText, copyLabel }: { to: string; draft: EmailDraft; copyText: string; copyLabel: string }) {
  return (
    <div className="letter border border-ink-900/25 shadow-[0_14px_28px_-18px_rgba(23,19,14,0.55)]">
      <div className="flex flex-col gap-x-6 gap-y-4 border-b border-ink-900/25 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-7">
        <dl className="min-w-0 space-y-1.5 font-mono text-[0.8125rem] leading-5 sm:flex-1">
          <div className="flex gap-3">
            <dt className="caption w-16 shrink-0 pt-0.5 text-ink-500">To</dt>
            <dd className="min-w-0 break-words text-ink-700">{to}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="caption w-16 shrink-0 pt-0.5 text-ink-500">Subject</dt>
            <dd className="min-w-0 break-words font-medium text-ink-900">{draft.subject}</dd>
          </div>
        </dl>
        <CopyButton text={copyText} label={copyLabel} />
      </div>
      <pre className="whitespace-pre-wrap break-words px-4 py-5 font-mono text-[0.8125rem] leading-[1.75] text-ink-900 sm:px-7 sm:py-7 sm:text-sm sm:leading-[1.8]">
        <DraftBody text={draft.body} />
      </pre>
    </div>
  );
}

export function PromoDetail({ plan }: { plan: PromoPlan }) {
  const bookingText = `Subject: ${plan.bookingEmail.subject}\n\n${plan.bookingEmail.body}`;
  const pitchText = `Subject: ${plan.partnerPitch.subject}\n\n${plan.partnerPitch.body}`;
  const groups = groupPartners(plan.partners);
  const generated = formatGenerated(plan.generatedAt);

  return (
    <article className="paper animate-rise shadow-sheet">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4 sm:px-9">
        <p className="caption text-ink-500">
          {plural(plan.partners.length, "partner", "partners")}
          <span aria-hidden="true"> / </span>
          <span className="sr-only">, </span>
          {plural(plan.adTargeting.length, "ad audience", "ad audiences")}
          <span aria-hidden="true"> / </span>
          <span className="sr-only">, </span>
          2 drafts
          {generated && (
            <>
              <span aria-hidden="true"> / </span>
              <span className="sr-only">, </span>
              Generated {generated}
            </>
          )}
        </p>
        {plan.demo && (
          <span className="caption -rotate-2 border-2 border-signal-700 px-2 py-0.5 text-signal-700">Sample data</span>
        )}
      </header>

      <Section
        number="01"
        id="promo-partners"
        title="Partners"
        description="Brands, places, podcasts, films and TV shows that this artist's fans over-index on, from Qloo's cross-domain insights."
      >
        {groups.length === 0 ? (
          <p className="text-[0.9375rem] text-ink-700">The plan lists no partners.</p>
        ) : (
          <div className="space-y-7">
            {groups.map((group) => (
              <div key={group.kind} className="grid gap-x-6 gap-y-3 sm:grid-cols-[6.5rem_minmax(0,1fr)]">
                <h3 className="caption flex items-baseline justify-between gap-2 border-t border-ink-900/60 pt-2 text-ink-900 sm:block">
                  {kindHeading(group.kind, group.items.length)}
                  <span className="text-ink-500 sm:mt-1 sm:block" aria-hidden="true">
                    {String(group.items.length).padStart(2, "0")}
                  </span>
                </h3>
                <ul className="space-y-6">
                  {group.items.map((partner) => (
                    <li key={partner.entityId} className="border-t border-ink-900/25 pt-2 sm:border-ink-900/60">
                      <h4 className="font-display text-[1.75rem] font-extrabold uppercase leading-[1.05] tracking-wide text-ink-900">
                        {partner.name}
                      </h4>
                      <p className="mt-2 max-w-[62ch] text-[0.9375rem] leading-relaxed text-ink-700">{partner.angle}</p>
                      <div className="mt-3">
                        <EvidenceChips chips={partner.evidence} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        number="02"
        id="promo-ads"
        title="Ad audiences"
        description="Audiences to target, each tied to the Qloo results it comes from."
      >
        {plan.adTargeting.length === 0 ? (
          <p className="text-[0.9375rem] text-ink-700">The plan lists no ad audiences.</p>
        ) : (
          <ul className="space-y-6">
            {plan.adTargeting.map((target, index) => (
              <li
                key={`${target.platform}-${index}`}
                className="grid gap-x-6 gap-y-2 border-t border-ink-900/60 pt-2 sm:grid-cols-[6.5rem_minmax(0,1fr)]"
              >
                <p className="caption text-ink-900">{PLATFORM_LABEL[target.platform] ?? target.platform}</p>
                <div className="min-w-0">
                  <p className="text-lg font-semibold leading-snug text-ink-900">{target.audience}</p>
                  <p className="mt-1.5 max-w-[62ch] text-[0.9375rem] leading-relaxed text-ink-700">{target.rationale}</p>
                  {target.basedOn.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="caption mr-1 flex items-center gap-2 text-ink-500">
                        <span className="h-2 w-2 bg-tape-700" aria-hidden="true" />
                        Based on
                      </span>
                      {target.basedOn.map((item) => (
                        <span
                          key={item.entityId}
                          className="max-w-full break-words border border-ink-900/25 bg-paper-50 px-2 py-0.5 font-mono text-xs font-medium leading-5 text-ink-900"
                        >
                          {item.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        number="03"
        id="promo-booking"
        title="Booking inquiry"
        description="A draft for the artist's agent. Replace each marked [placeholder] with real facts before you send it."
      >
        <Letter to="The artist's agent" draft={plan.bookingEmail} copyText={bookingText} copyLabel="booking inquiry" />
      </Section>

      <Section
        number="04"
        id="promo-pitch"
        title="Partner pitch"
        description={`A short pitch to ${plan.partnerPitch.partnerName}, one of the partners above.`}
      >
        <Letter to={plan.partnerPitch.partnerName} draft={plan.partnerPitch} copyText={pitchText} copyLabel="partner pitch" />
      </Section>
    </article>
  );
}
