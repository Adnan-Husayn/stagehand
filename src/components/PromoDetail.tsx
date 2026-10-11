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
    <section aria-labelledby={id} className="border-t-2 border-ink pb-12 pt-3 last:pb-0">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={id} className="title text-lg">
          {title}
        </h2>
        {count && <p className="figure shrink-0 text-ink-3">{count}</p>}
      </div>
      {description && <p className="mt-1 max-w-[62ch] text-sm text-ink-2">{description}</p>}
      <div className="mt-5">{children}</div>
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
          <mark key={index} className="bg-mark px-0.5">
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
    <div className="border border-rule">
      <div className="flex flex-col gap-x-6 gap-y-4 border-b border-rule px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <dl className="min-w-0 space-y-1 text-sm sm:flex-1">
          <div className="flex gap-3">
            <dt className="w-14 shrink-0 text-ink-3">To</dt>
            <dd className="min-w-0 break-words text-ink">{to}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-14 shrink-0 text-ink-3">Subject</dt>
            <dd className="min-w-0 break-words font-semibold text-ink">{draft.subject}</dd>
          </div>
        </dl>
        <CopyButton text={copyText} label={copyLabel} />
      </div>
      <div className="max-w-[72ch] whitespace-pre-wrap break-words px-4 py-5 text-base leading-[1.7] text-ink sm:px-6 sm:py-6">
        <DraftBody text={draft.body} />
      </div>
    </div>
  );
}

const TABLE_ROW = "grid gap-x-6 gap-y-2 border-t border-ink pt-3 sm:grid-cols-[8.5rem_minmax(0,1fr)]";

export function PromoDetail({ plan }: { plan: PromoPlan }) {
  const bookingText = `Subject: ${plan.bookingEmail.subject}\n\n${plan.bookingEmail.body}`;
  const pitchText = `Subject: ${plan.partnerPitch.subject}\n\n${plan.partnerPitch.body}`;
  const groups = groupPartners(plan.partners);
  const generated = formatGenerated(plan.generatedAt);
  const summary = [
    plural(plan.partners.length, "partner", "partners"),
    plural(plan.adTargeting.length, "ad audience", "ad audiences"),
    "2 drafts",
    ...(generated ? [`Generated ${generated}`] : []),
  ];

  return (
    <article className="animate-view-in">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-6">
        <p className="text-sm text-ink-2">
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
        {plan.demo && <span className="border border-ink px-1.5 font-mono text-2xs font-semibold text-ink">Sample data</span>}
      </header>

      <Section
        id="promo-partners"
        title="Partners"
        count={plural(plan.partners.length, "partner", "partners")}
        description="Brands, places, podcasts, films and TV shows that this artist's fans over-index on, from Qloo's cross-domain insights."
      >
        {groups.length === 0 ? (
          <p className="text-base text-ink-2">The plan lists no partners.</p>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => (
              <div key={group.kind} className={TABLE_ROW}>
                <h3 className="label flex items-baseline justify-between gap-2 sm:block">
                  {kindHeading(group.kind, group.items.length)}
                  <span className="figure font-normal text-ink-3 sm:mt-0.5 sm:block" aria-hidden="true">
                    {group.items.length}
                  </span>
                </h3>
                <ul>
                  {group.items.map((partner) => (
                    <li
                      key={partner.entityId}
                      className="grid gap-x-6 gap-y-3 border-t border-rule py-4 first:border-t-0 first:pt-0 last:pb-0 2xl:grid-cols-[minmax(0,1fr)_15rem]"
                    >
                      <div className="min-w-0">
                        <h4 className="title break-words text-lg">{partner.name}</h4>
                        <p className="mt-1.5 max-w-[60ch] text-base text-ink-2">{partner.angle}</p>
                      </div>
                      <div className="max-w-sm 2xl:max-w-none">
                        <EvidenceChips chips={partner.evidence} entityId={partner.entityId} />
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
        id="promo-ads"
        title="Ad audiences"
        count={plural(plan.adTargeting.length, "audience", "audiences")}
        description="Audiences to target, each tied to the Qloo results it comes from."
      >
        {plan.adTargeting.length === 0 ? (
          <p className="text-base text-ink-2">The plan lists no ad audiences.</p>
        ) : (
          <ul className="space-y-6">
            {plan.adTargeting.map((target, index) => (
              <li key={`${target.platform}-${index}`} className={TABLE_ROW}>
                <p className="label">{PLATFORM_LABEL[target.platform] ?? target.platform}</p>
                <div className="min-w-0">
                  <p className="text-md font-semibold text-ink">{target.audience}</p>
                  <p className="mt-1.5 max-w-[60ch] text-base text-ink-2">{target.rationale}</p>
                  {target.basedOn.length > 0 && (
                    <dl className="mt-3 flex gap-3 border-t border-rule pt-2 text-sm">
                      <dt className="shrink-0 text-ink-3">Based on</dt>
                      <dd className="min-w-0 break-words text-ink">
                        {target.basedOn.map((item, itemIndex) => (
                          <Fragment key={item.entityId}>
                            {itemIndex > 0 && ", "}
                            {item.name}
                          </Fragment>
                        ))}
                      </dd>
                    </dl>
                  )}
                </div>
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
