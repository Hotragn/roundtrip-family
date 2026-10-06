"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Bus, Check, Footprints, TrainFront, Undo2, X } from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { DAY_NAMES, hhmm, hoursLine, longDate, tripLine, whoFor } from "@/lib/plan-format";
import type { BoardItem, PlanBoard } from "@/lib/plan-types";
import { PlacePhoto } from "./place-photo";
import { LadderBadge, ReasonChips } from "./reason";
import type { EffectiveItem } from "./use-overlay";

// MapLibre loads only when a route opens (docs/brand.md, Maps).
const RouteMap = dynamic(() => import("./route-map").then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-card bg-surface-sunken" />,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-line pt-5">
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Legs({ item }: { item: BoardItem }) {
  if (item.legs.length === 0) {
    return <p className="text-[15px] text-text-muted">{tripLine(item) || "Travel time not known yet."}</p>;
  }
  return (
    <ol className="space-y-2.5">
      {item.legs.map((l, i) => {
        const Icon = l.mode === "walk" ? Footprints : l.mode === "rail" ? TrainFront : Bus;
        const text =
          l.mode === "walk"
            ? `Walk ${l.minutes} min to ${l.to.name}`
            : `${l.mode === "rail" ? l.line?.name : `Bus ${l.line?.name}`} toward ${l.line?.headsign ?? ""}, ${l.stops ?? "?"} stops, from ${l.from.name} to ${l.to.name}`;
        return (
          <li key={i} className="flex gap-3 text-[15px] leading-snug">
            <Icon aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 stroke-[1.75] text-text-muted" />
            <span>
              {text}
              {l.departs ? <span className="text-text-muted"> · leaves {l.departs}</span> : null}
            </span>
          </li>
        );
      })}
      <li className="flex gap-3 text-[15px] font-semibold">
        <Check aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 stroke-[2]" />
        Home by {hhmm(item.back)}
      </li>
    </ol>
  );
}

export function ItemSheet({
  board,
  item,
  open,
  onOpenChange,
  onApprove,
  onUnapprove,
  onSwap,
  onUnswap,
}: {
  board: PlanBoard;
  item: EffectiveItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (item: EffectiveItem) => void;
  onUnapprove: (item: EffectiveItem) => void;
  onSwap: (item: EffectiveItem, to: BoardItem) => void;
  onUnswap: (item: EffectiveItem) => void;
}) {
  const date = item ? board.week.days.find((d) => d.day === item.day)?.date : undefined;
  const alternatives = item ? (board.alternatives[item.slotId] ?? []).filter((a) => a.id !== item.id) : [];
  const original = item?.swapped ? board.items.find((i) => i.id === item.slotId) : undefined;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-40 bg-ink/25 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <DialogPrimitive.Popup className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[600px] flex-col bg-surface shadow-overlay outline-none transition-transform duration-300 ease-paper data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full motion-reduce:transition-none">
          {item ? (
            <>
              <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm text-text-muted">
                    {date ? longDate(date) : DAY_NAMES[item.day]} · {hhmm(item.depart)} to {hhmm(item.back)} ·{" "}
                    {whoFor(item, board)}
                  </p>
                  <DialogPrimitive.Title className="text-[25px] font-semibold leading-tight">
                    {item.title}
                  </DialogPrimitive.Title>
                  <p className="text-sm text-text-muted">{item.address}</p>
                </div>
                <DialogPrimitive.Close render={<Button variant="quiet" size="icon" aria-label="Close" />}>
                  <X aria-hidden="true" className="size-5" />
                </DialogPrimitive.Close>
              </div>
              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
                <div className="h-[280px]">
                  <RouteMap legs={item.legs} venue={item.location} label={`Map of the route to ${item.title}`} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <LadderBadge level={item.ladderLevel} label={item.ladderLabel} />
                  {item.firstRideTogether ? (
                    <span className="rounded-chip bg-surface-sunken px-2 py-1 text-[13px] font-medium">
                      First time: ride it with them at the weekend
                    </span>
                  ) : null}
                </div>

                <Section title="Why this">
                  <p className="text-[15px] leading-relaxed">{item.reasonText}</p>
                  <ReasonChips chips={item.chips} />
                  <dl className="grid grid-cols-3 gap-3 rounded-card bg-surface-sunken p-3 text-center">
                    <div>
                      <dt className="text-[13px] text-text-muted">Chance they go</dt>
                      <dd className="text-[20px] font-semibold tabular-nums">{Math.round(item.score.pGo * 100)}%</dd>
                    </div>
                    <div>
                      <dt className="text-[13px] text-text-muted">Expected enjoyment</dt>
                      <dd className="text-[20px] font-semibold tabular-nums">
                        {item.score.enjoyment.toFixed(1)}
                        <span className="text-[13px] font-normal text-text-muted"> of 5</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[13px] text-text-muted">Score</dt>
                      <dd className="text-[20px] font-semibold tabular-nums">{item.score.combined.toFixed(2)}</dd>
                    </div>
                  </dl>
                  <p className="text-[13px] text-text-muted">
                    TabPFN predictions from their past outings (a synthetic history for this fictional family). The
                    place comes from a live search.
                  </p>
                </Section>

                <Section title="The trip">
                  <Legs item={item} />
                  {hoursLine(item, item.day) ? (
                    <p className="text-[13px] text-text-muted">
                      {hoursLine(item, item.day)}, from the place&rsquo;s listing.
                    </p>
                  ) : null}
                </Section>

                {item.cards.length > 0 ? (
                  <Section title="On their phone">
                    {item.cards.map((c) => {
                      const parent = board.parents.find((p) => p.id === c.parentId);
                      return (
                        <article key={c.parentId} className="space-y-3 rounded-ticket bg-paper p-4 ring-1 ring-line">
                          <p className="text-[13px] text-text-muted">{parent?.firstName}&rsquo;s ticket, in Telugu</p>
                          <h4 className="text-[20px] font-semibold" lang="te">
                            {c.title}
                          </h4>
                          <p className="text-[15px] leading-[1.7]" lang="te">
                            {c.body}
                          </p>
                          <p className="text-[13px] text-text-muted">
                            Driver card: &ldquo;{c.driver.lead} {c.driver.stopName}&rdquo; · {c.phrases.length} phrases
                            to practise
                          </p>
                          <a
                            href={`/parents/${board.household.slug}/${c.parentId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block text-sm font-semibold text-sky-text underline-offset-4 hover:underline"
                          >
                            Open {parent?.firstName}&rsquo;s phone
                          </a>
                        </article>
                      );
                    })}
                  </Section>
                ) : (
                  <Section title="On their phone">
                    <p className="text-[15px] text-text-muted">
                      Directions and the card in their language are written the next time the week is planned, once this
                      is approved.
                    </p>
                  </Section>
                )}

                {item.joinCard ? (
                  <Section title="Help joining">
                    <p className="text-[15px]">&ldquo;{item.joinCard.local}&rdquo;</p>
                    <p className="text-[13px] text-text-muted">{item.joinCard.askWho}</p>
                  </Section>
                ) : null}
                {item.bringSomeone ? (
                  <Section title="Who could come along">
                    <p className="text-[15px]">
                      {item.bringSomeone.label}: {item.bringSomeone.why}
                    </p>
                  </Section>
                ) : null}

                {alternatives.length > 0 || original ? (
                  <Section title={`Other options for ${DAY_NAMES[item.day] ?? "this day"}`}>
                    {original ? (
                      <Button variant="secondary" size="sm" onClick={() => onUnswap(item)}>
                        <Undo2 aria-hidden="true" className="size-4" />
                        Back to {original.title}
                      </Button>
                    ) : null}
                    <ul className="space-y-3">
                      {alternatives.map((a) => (
                        <li key={a.id} className="flex gap-3 rounded-card p-3 ring-1 ring-line">
                          <PlacePhoto
                            url={a.photo?.url}
                            width={192}
                            height={192}
                            category={a.category}
                            className="size-16 shrink-0 rounded-md"
                          />
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <p className="font-semibold leading-snug">{a.title}</p>
                            <p className="text-[13px] text-text-muted">
                              {hhmm(a.depart)} to {hhmm(a.back)} · {tripLine(a)} · score {a.score.combined.toFixed(2)}
                            </p>
                            <ReasonChips chips={a.chips} max={2} size="sm" />
                          </div>
                          <Button variant="secondary" size="sm" className="self-center" onClick={() => onSwap(item, a)}>
                            Use this
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </Section>
                ) : null}
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
                {item.status === "approved" ? (
                  <>
                    <span className="mr-auto inline-flex items-center gap-1.5 text-sm font-semibold">
                      <Check aria-hidden="true" className="size-4 stroke-[2.25]" />
                      Approved
                    </span>
                    <Button variant="secondary" onClick={() => onUnapprove(item)}>
                      Take it off their week
                    </Button>
                  </>
                ) : (
                  <Button variant="primary" onClick={() => onApprove(item)}>
                    Approve
                  </Button>
                )}
              </div>
            </>
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
