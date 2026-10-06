"use client";

import { speechTag } from "@roundtrip/core/languages";
import { format } from "date-fns";
import { te } from "date-fns/locale";
import { Hand, MessageCircle, Navigation, Users } from "lucide-react";
import { ListenButton } from "@/components/parents/listen-button";
import { Ticket } from "@/components/parents/ticket";
import type { LegSummary } from "@/components/travel/travel-line";
import { DEMO_NOW, fmtTime, type OutingView, placePhoto } from "@/lib/week";
import { useParents } from "../context";

export function legsOf(o: OutingView): LegSummary[] {
  if (o.route) {
    return o.route.legs.map((l) => ({
      mode: l.mode === "rail" ? "rail" : l.mode === "walk" ? "walk" : "bus",
      minutes: l.durationMinutes,
      stops: l.numStops,
    }));
  }
  return o.withAdultChild ? [{ mode: "car", minutes: 20 }] : [];
}

export function metaOf(o: OutingView, t: ReturnType<typeof useParents>["t"]): string {
  if (!o.route) return o.withAdultChild ? `${t("Parents.withChild")} · ${t("Parents.car")}` : "";
  const transit = o.route.legs.filter((l) => l.mode !== "walk");
  if (transit.length === 0) return `${t("Parents.walk")} · ${t("Parents.minutes", { n: o.route.totalMinutes })}`;
  const lines = transit.map((l) => `${l.mode === "rail" ? "" : "Bus "}${l.line?.name ?? ""}`.trim()).join(" + ");
  const stops = transit.reduce((s, l) => s + (l.numStops ?? 0), 0);
  return `${lines} · ${t("Parents.minutes", { n: o.route.totalMinutes })} · ${t("Parents.stops", { n: stops })}`;
}

const dayLabel = (date: string) => format(new Date(`${date}T12:00:00`), "EEEE, d MMMM", { locale: te });

export function TodayView({ featuredId, onFeature }: { featuredId: string | null; onFeature: (id: string) => void }) {
  const { outings, parent, card: _card, home, go, t, week } = useParents();
  const todays = outings.filter((o) => o.date === DEMO_NOW.date);
  const featured = outings.find((o) => o.id === featuredId) ?? todays[0] ?? outings[0] ?? null;
  const card = featured?.cards.find((c) => c.parentId === parent.id) ?? featured?.cards[0];
  const audioFirst = parent.readingSupport === "audio_first";
  const isToday = featured?.date === DEMO_NOW.date;
  const knowsSomeone = week.people.some((p) => p.knownParentIds.includes(parent.id) && p.words.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[18px] text-text-muted" lang="te">
          {dayLabel(DEMO_NOW.date)}
        </p>
        <h1 className="mt-1 text-[30px] font-semibold" lang="te">
          {parent.role === "father" ? t("Parents.greetingFather") : t("Parents.greetingMother")}
        </h1>
      </div>

      {!featured || !card ? (
        <p className="rounded-card bg-surface-sunken p-5 text-parent" lang="te">
          {t("Parents.noPlanToday")}
        </p>
      ) : (
        <>
          {!isToday ? (
            <p className="text-parent font-semibold" lang="te">
              {t("Parents.nextPlan")}: {dayLabel(featured.date)}
            </p>
          ) : null}
          <Ticket
            legs={legsOf(featured)}
            linesLabel={metaOf(featured, t)}
            leave={fmtTime(featured.slot.depart)}
            back={fmtTime(featured.slot.back)}
            leaveLabel={t("Parents.leave")}
            backLabel={t("Parents.back")}
            photo={
              featured.photo
                ? { url: placePhoto(featured.photo.url, 288, 288), fallback: featured.photo.url, credit: "Google Maps" }
                : null
            }
            title={card.title}
            meta={metaOf(featured, t)}
            badges={
              featured.firstRideTogether ? (
                <span
                  className="inline-flex items-center gap-2 rounded-full bg-sky-line/12 px-3 py-1.5 text-[17px] font-medium text-sky-text"
                  lang="te"
                >
                  <Users aria-hidden="true" className="shrink-0 size-5 stroke-[1.75]" />
                  {t("Parents.firstRide")}
                </span>
              ) : null
            }
            home={Boolean(home[featured.id])}
            stampLabel={t("Parents.stamp")}
            stub={
              audioFirst ? (
                <>
                  <ListenButton
                    src={card.audio?.body}
                    text={card.body}
                    lang={speechTag(parent.language)}
                    label={t("Parents.listen")}
                    stopLabel={t("Parents.stopListening")}
                  />
                  <button
                    type="button"
                    onClick={() => go("directions", featured.id)}
                    className="inline-flex flex-wrap min-h-14 items-center gap-2 rounded-xl border border-line-strong px-5 text-parent font-semibold"
                    lang="te"
                  >
                    <Navigation aria-hidden="true" className="shrink-0 size-6 stroke-[1.75]" />
                    {t("Parents.directions")}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => go("directions", featured.id)}
                    className="inline-flex flex-wrap min-h-14 items-center gap-2 rounded-xl bg-bus px-6 text-parent font-semibold text-on-bus"
                    lang="te"
                  >
                    <Navigation aria-hidden="true" className="shrink-0 size-6 stroke-[1.75]" />
                    {t("Parents.directions")}
                  </button>
                  <ListenButton
                    src={card.audio?.body}
                    text={card.body}
                    lang={speechTag(parent.language)}
                    label={t("Parents.listen")}
                    stopLabel={t("Parents.stopListening")}
                    tone="secondary"
                  />
                </>
              )
            }
          />
          <p className="text-parent leading-[1.7]" lang="te">
            {card.body}
          </p>
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => go("driver", featured.id)}
              className="flex flex-wrap min-h-16 items-center justify-center gap-3 rounded-xl border-2 border-ink bg-surface px-6 text-parent font-semibold"
              lang="te"
            >
              <Hand aria-hidden="true" className="shrink-0 size-6 stroke-[1.75]" />
              {featured.route?.legs.some((l) => l.mode !== "walk") ? t("Parents.showDriver") : t("Parents.showSomeone")}
            </button>
            <button
              type="button"
              onClick={() => go("practice", featured.id)}
              className="flex flex-wrap min-h-14 items-center justify-center gap-3 rounded-xl border border-line-strong bg-surface px-6 text-parent font-medium"
              lang="te"
            >
              <MessageCircle aria-hidden="true" className="shrink-0 size-6 stroke-[1.75]" />
              {t("Parents.practice")}
            </button>
            {featured.joinCard ? (
              <button
                type="button"
                onClick={() => go("join", featured.id)}
                className="flex min-h-14 items-center justify-center rounded-xl border border-line-strong bg-surface px-6 text-parent font-medium"
                lang="te"
              >
                {t("Join.title")}
              </button>
            ) : null}
            {knowsSomeone ? (
              <button
                type="button"
                onClick={() => go("friend", featured.id)}
                className="flex min-h-14 items-center justify-center rounded-xl border border-line-strong bg-surface px-6 text-parent font-medium"
                lang="te"
              >
                {t("Friend.title")}
              </button>
            ) : null}
          </div>
        </>
      )}

      {outings.length > 1 ? (
        <section aria-labelledby="week-h" className="pt-2">
          <h2 id="week-h" className="text-[22px] font-semibold" lang="te">
            {t("Parents.laterThisWeek")}
          </h2>
          <ul className="mt-3 divide-y divide-line rounded-card bg-surface ring-1 ring-line">
            {outings.map((o) => {
              const c = o.cards.find((x) => x.parentId === parent.id) ?? o.cards[0];
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => onFeature(o.id)}
                    className="flex min-h-16 w-full items-center justify-between gap-4 px-5 py-3 text-left"
                    aria-current={featured?.id === o.id ? "true" : undefined}
                  >
                    <span>
                      <span className="block text-[17px] text-text-muted" lang="te">
                        {dayLabel(o.date)} · {fmtTime(o.slot.depart)}
                      </span>
                      <span className="block text-parent font-semibold" lang="te">
                        {c?.title ?? o.venue}
                      </span>
                    </span>
                    {home[o.id] ? (
                      <span className="text-[16px] font-semibold text-home-green-text" lang="te">
                        {t("Parents.stamp")}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
