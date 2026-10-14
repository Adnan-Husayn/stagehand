"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";
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
  id,
  title,
  count,
  description,
  children,
}: {
  id: string;
  title: string;
  count?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-11">
      <div className="flex items-baseline justify-between gap-4 border-b border-hair pb-2">
        <h2 id={id} className="title text-[clamp(1.8rem,3vw,2.5rem)] italic">
          {title}
        </h2>
        {count && <p className="font-mono text-sm text-lit">{count}</p>}
      </div>
      {description && <p className="mt-[0.6rem] max-w-[40rem] text-base text-lit">{description}</p>}
      {children}
    </section>
  );
}

/** Draft text with each [placeholder] marked so it is easy to find and replace. */
function DraftBody({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]\n]+\])/g);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? <mark key={index}>{part}</mark> : <Fragment key={index}>{part}</Fragment>,
      )}
    </>
  );
}

function Letter({ to, draft, copyText, copyLabel }: { to: string; draft: EmailDraft; copyText: string; copyLabel: string }) {
  return (
    <div className="mt-5 overflow-hidden rounded-md border border-hair bg-[rgba(13,18,28,0.96)]">
      <div className="flex flex-col gap-4 border-b border-hair bg-raised/90 px-5 py-[1.1rem] sm:flex-row sm:items-start sm:justify-between">
        <dl className="grid min-w-0 gap-1 text-ui">
          <div className="flex gap-3">
            <dt className="w-[3.75rem] flex-none text-soft">To</dt>
            <dd className="min-w-0 [overflow-wrap:anywhere]">{to}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-[3.75rem] flex-none text-soft">Subject</dt>
            <dd className="min-w-0 font-semibold [overflow-wrap:anywhere]">{draft.subject}</dd>
          </div>
        </dl>
        <CopyButton text={copyText} label={copyLabel} />
      </div>
      <div className="max-w-[46rem] whitespace-pre-wrap px-5 pb-[1.6rem] pt-[1.4rem] leading-[1.7] [overflow-wrap:anywhere]">
        <DraftBody text={draft.body} />
      </div>
    </div>
  );
}

const BOX = "mt-5 rounded-md border border-hair bg-[rgba(13,18,28,0.96)]";

export function PromoDetail({ plan }: { plan: PromoPlan }) {
  const bookingText = `Subject: ${plan.bookingEmail.subject}\n\n${plan.bookingEmail.body}`;
  const pitchText = `Subject: ${plan.partnerPitch.subject}\n\n${plan.partnerPitch.body}`;
  const partners = groupPartners(plan.partners).flatMap((group) => group.items);
  const generated = formatGenerated(plan.generatedAt);
  const summary = [
    plural(plan.partners.length, "partner", "partners"),
    plural(plan.adTargeting.length, "ad audience", "ad audiences"),
    "2 drafts",
    ...(generated ? [`Generated ${generated}`] : []),
  ];

  return (
    <article className="promo">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 text-ui text-lit">
        <p>
          {summary.map((part, index) => (
            <Fragment key={part}>
              {index > 0 && (
                <>
                  <span aria-hidden="true"> / </span>
                  <span className="sr-only">, </span>
                </>
              )}
              {part}
            </Fragment>
          ))}
        </p>
        {plan.demo && (
          <span className="rounded-full border border-key bg-panel px-[0.55rem] py-[0.15rem] font-mono text-2xs font-medium uppercase tracking-[0.06em] text-key">
            Sample data
          </span>
        )}
      </header>

      <Section
        id="promo-partners"
        title="Partners"
        count={plural(plan.partners.length, "partner", "partners")}
        description="Brands, places, podcasts, films and TV shows that this artist's fans over-index on, from Qloo's cross-domain insights."
      >
        {partners.length === 0 ? (
          <p className="mt-5 text-base text-soft">The plan lists no partners.</p>
        ) : (
          <div className={BOX}>
            {partners.map((partner, index) => (
              <article
                key={partner.entityId}
                className="partner tile-in grid gap-x-8 gap-y-[0.2rem] border-t border-hair px-5 pb-[1.4rem] pt-[1.3rem] first:border-t-0 xl:grid-cols-[6.5rem_minmax(0,1fr)_16.5rem] xl:grid-rows-[auto_1fr]"
                style={{ "--i": index } as CSSProperties}
              >
                <p className="pt-[0.45rem] font-mono text-2xs font-medium uppercase leading-[1.3] tracking-[0.12em] text-key xl:col-start-1 xl:row-span-2 xl:row-start-1">
                  {kindHeading(partner.kind, 1)}
                </p>
                <h3 className="title text-[clamp(1.5rem,2.2vw,1.9rem)] [overflow-wrap:anywhere] xl:col-start-2">
                  {partner.name}
                </h3>
                <p className="mt-2 text-base text-soft xl:col-start-2">{partner.angle}</p>
                <div className="mt-[0.7rem] min-w-0 xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:mt-0 xl:self-start">
                  <EvidenceChips chips={partner.evidence} entityId={partner.entityId} />
                </div>
              </article>
            ))}
          </div>
        )}
      </Section>

      <Section
        id="promo-ads"
        title="Ad audiences"
        count={plural(plan.adTargeting.length, "audience", "audiences")}
        description="Audiences to target, each tied to the Qloo results it comes from."
      >
        {plan.adTargeting.length === 0 ? (
          <p className="mt-5 text-base text-soft">The plan lists no ad audiences.</p>
        ) : (
          <ul
            className={`${BOX} grid overflow-hidden sm:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]`}
            style={{ "--cols": Math.min(plan.adTargeting.length, 3) } as CSSProperties}
          >
            {plan.adTargeting.map((target, index) => (
              <li
                key={`${target.platform}-${index}`}
                className="tile-in border-t border-hair px-5 pb-[1.4rem] pt-[1.3rem] first:border-t-0 sm:border-l sm:border-t-0 sm:[&:nth-child(3n+1)]:border-l-0 sm:[&:nth-child(n+4)]:border-t"
                style={{ "--i": index } as CSSProperties}
              >
                <p className="font-mono text-2xs font-medium uppercase leading-[1.3] tracking-[0.12em] text-key">
                  {PLATFORM_LABEL[target.platform] ?? target.platform}
                </p>
                <p className="mt-2 text-md font-semibold leading-[1.35]">{target.audience}</p>
                <p className="mt-2 text-base text-soft">{target.rationale}</p>
                {target.basedOn.length > 0 && (
                  <dl className="mt-[0.9rem] border-t border-hair pt-[0.55rem] text-ui">
                    <dt className="text-soft">Based on</dt>
                    <dd className="mt-[0.45rem]">
                      <ul className="flex flex-wrap gap-[0.4rem]">
                        {target.basedOn.map((item) => (
                          <li
                            key={item.entityId}
                            className="max-w-full rounded-full border border-key/70 px-[0.7rem] py-[0.2rem] text-sm font-medium text-key [overflow-wrap:anywhere]"
                          >
                            {item.name}
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </dl>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        id="promo-booking"
        title="Booking inquiry"
        description="A draft for the artist's agent. Replace each marked [placeholder] with real facts before you send it."
      >
        <Letter to="The artist's agent" draft={plan.bookingEmail} copyText={bookingText} copyLabel="booking inquiry" />
      </Section>

      <Section
        id="promo-pitch"
        title="Partner pitch"
        description={`A short pitch to ${plan.partnerPitch.partnerName}, one of the partners above.`}
      >
        <Letter to={plan.partnerPitch.partnerName} draft={plan.partnerPitch} copyText={pitchText} copyLabel="partner pitch" />
      </Section>
    </article>
  );
}
