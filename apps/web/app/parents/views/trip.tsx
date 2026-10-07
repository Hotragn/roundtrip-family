"use client";

import { languageNameIn, speechTag } from "@roundtrip/core/languages";
import { LocateFixed } from "lucide-react";
import { useState } from "react";
import { DriverCard, PhraseCard } from "@/components/parents/cards";
import { ListenButton } from "@/components/parents/listen-button";
import { StopCountdown, useStopAlert } from "@/components/parents/stop-countdown";
import { cn } from "@/lib/utils";
import { useParents } from "../context";

export function DirectionsView() {
  const { outing, card, parent, t, week } = useParents();
  const legs = outing?.route?.legs ?? [];
  const transit = legs.filter((l) => l.mode !== "walk");
  const last = transit.at(-1);
  const { state, start } = useStopAlert(last?.stopBefore?.location, last?.to.location);
  if (!outing || !card) return null;
  const local = week.household.localLanguage;
  const signWords = parent.readingSupport === "text_with_sign_words";
  return (
    <div className="space-y-6">
      <h1 className="text-[30px] font-semibold" lang="te">
        {t("Directions.title")} · <span lang={local}>{outing.venue}</span>
      </h1>
      {state === "next" ? (
        <div
          role="alert"
          className="rounded-card border-2 border-ink bg-bus p-5 text-[24px] font-semibold text-on-bus"
          lang="te"
        >
          {t("Directions.stopNext")}
        </div>
      ) : null}
      {legs.length > 0 ? (
        <StopCountdown
          legs={legs}
          venue={outing.venue}
          nameLang={local}
          gps={state}
          labels={{
            yourStop: t("Directions.yourStop"),
            pressAfter: (stop) => t("Directions.pressAfter", { stop }),
            stopsToGo: (n) => t("Directions.stopsToGo", { n }),
            walk: t("Parents.walk"),
            minutes: (n) => t("Parents.minutes", { n }),
          }}
        />
      ) : (
        <p className="text-parent" lang="te">
          {t("Parents.withChild")}
        </p>
      )}
      {transit.length > 0 ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={start}
            disabled={state !== "off" && state !== "unavailable"}
            className="flex flex-wrap min-h-14 w-full items-center justify-center gap-3 rounded-xl border border-line-strong bg-surface px-5 text-parent font-semibold disabled:opacity-70"
            lang="te"
          >
            <LocateFixed aria-hidden="true" className="shrink-0 size-6 stroke-[1.75]" />
            {state === "off"
              ? t("Directions.showWhere")
              : state === "unavailable"
                ? t("Directions.noFix")
                : t("Directions.locating")}
          </button>
        </div>
      ) : null}
      <ol className="space-y-3">
        {card.steps.map((s, i) => (
          <li key={i} className="rounded-card bg-surface p-4 ring-1 ring-line">
            <p className="text-parent leading-[1.6]" lang="te">
              {s.text}
            </p>
            {signWords && s.signWords.length > 0 ? (
              <div className="mt-3">
                <p className="text-[15px] text-text-muted" lang="te">
                  {t("Directions.signWords", { language: languageNameIn(local, parent.language) })}
                </p>
                <div className="mt-1 flex flex-wrap gap-2" lang={local}>
                  {s.signWords.map((w) => (
                    <span key={w} className="rounded-md border border-ink px-2.5 py-1 text-[19px] font-semibold">
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      {outing.landmarkPhotos.length > 0 ? (
        <section aria-labelledby="lm-h">
          <h2 id="lm-h" className="text-[22px] font-semibold" lang="te">
            {t("Directions.landmarks")}
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {outing.landmarkPhotos.slice(0, 4).map((src) => (
              // biome-ignore lint/performance/noImgElement: cached for offline use by the service worker
              <img
                key={src}
                src={src}
                alt=""
                className="aspect-[2/1] w-full rounded-lg object-cover ring-1 ring-line"
                loading="lazy"
              />
            ))}
          </div>
          <p className="mt-2 text-[13px] text-text-muted" lang="en">
            Street View: Google
          </p>
        </section>
      ) : null}
      <ListenButton
        text={card.steps.map((s) => s.text).join(" ")}
        lang={speechTag(parent.language)}
        label={t("Parents.listen")}
        stopLabel={t("Parents.stopListening")}
        tone="secondary"
      />
    </div>
  );
}

export function DriverView() {
  const { outing, card, parent, t, week } = useParents();
  const [legIndex, setLegIndex] = useState(0);
  if (!outing || !card) return null;
  const h = week.household;
  const transit = outing.route?.legs.filter((l) => l.mode !== "walk") ?? [];
  const walking = transit.length === 0;
  // With a transfer there is a driver card for each bus or train, in the order they ride them.
  const leg = transit[Math.min(legIndex, transit.length - 1)];
  const lineLabel = (l: (typeof transit)[number]) => `${l.mode === "bus" ? "Bus " : ""}${l.line?.name ?? ""}`.trim();
  return (
    <div className="space-y-4">
      <h1 className="sr-only" lang="te">
        {t("Driver.title")}
      </h1>
      {transit.length > 1 ? (
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("Driver.title")}>
          {transit.map((l, i) => (
            <button
              key={`${l.line?.name}-${i}`}
              type="button"
              aria-pressed={i === legIndex}
              onClick={() => setLegIndex(i)}
              className={cn(
                "min-h-14 rounded-xl border px-4 text-left text-[19px] font-semibold",
                i === legIndex ? "border-ink bg-ink text-white" : "border-line-strong bg-surface",
              )}
              lang={h.localLanguage}
            >
              <span className="tabular-nums">{i + 1}</span> · {lineLabel(l)}
            </button>
          ))}
        </div>
      ) : null}
      <DriverCard
        lead={walking ? h.localPhrases.askWay : card.driver.lead}
        stopName={walking ? outing.venue : (leg?.to.name ?? card.driver.stopName)}
        address={walking ? outing.address : undefined}
        thanks={card.driver.thanks}
        localLanguage={h.localLanguage}
        speech={speechTag(h.localLanguage, h.hostCountry)}
        labels={{
          hint: t("Driver.hint"),
          play: t("Driver.playLocal", { language: languageNameIn(h.localLanguage, parent.language) }),
          stop: t("Parents.stopListening"),
        }}
      />
    </div>
  );
}

export function PracticeView() {
  const { card, t, week } = useParents();
  if (!card) return null;
  const local = week.household.localLanguage;
  const speech = speechTag(local, week.household.hostCountry);
  return (
    <div className="space-y-5">
      <h1 className="text-[30px] font-semibold" lang="te">
        {t("Practice.title")}
      </h1>
      <ul className="space-y-4">
        {card.phrases.map((p) => (
          <PhraseCard
            key={p.id}
            local={p.local}
            pronunciation={p.pronunciation}
            meaning={p.meaning}
            audio={p.audio?.local}
            localLanguage={local}
            speech={speech}
            labels={{
              say: t("Practice.say"),
              means: t("Practice.means"),
              play: t("Practice.play"),
              stop: t("Parents.stopListening"),
            }}
          />
        ))}
      </ul>
    </div>
  );
}

export function JoinView() {
  const { outing, outings, t, week, go } = useParents();
  // The ticket's own card, or the week's first outing that has one.
  const target = outing?.joinCard ? outing : outings.find((o) => o.joinCard);
  const join = target?.joinCard;
  const local = week.household.localLanguage;
  if (!target || !join) {
    return (
      <div className="space-y-5">
        <h1 className="text-[30px] font-semibold" lang="te">
          {t("Join.title")}
        </h1>
        <p className="text-parent" lang="te">
          {t("Join.noneThisWeek")}
        </p>
        <button
          type="button"
          onClick={() => go("today")}
          className="flex min-h-14 w-full items-center justify-center rounded-xl border border-line-strong bg-surface text-parent font-semibold"
          lang="te"
        >
          {t("Parents.back_to_today")}
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <h1 className="text-[30px] font-semibold" lang="te">
        {t("Join.title")}
      </h1>
      <p className="text-[18px] text-text-muted" lang="te">
        {t("Join.forPlace", { place: target.venue })}
      </p>
      <p className="text-parent" lang="te">
        {t("Join.show")}
      </p>
      <div className="rounded-ticket bg-surface p-6 shadow-raised ring-1 ring-line" lang={local}>
        <p className="text-[32px] font-semibold leading-snug">{join.local}</p>
      </div>
      <p className="text-parent" lang="te">
        {join.meaning}
      </p>
      <div>
        <p className="text-[16px] text-text-muted" lang="te">
          {t("Join.askWho")}
        </p>
        <p className="text-[24px] font-semibold" lang={local}>
          {join.askWho}
        </p>
      </div>
      <ListenButton
        text={`${join.local} ${join.askWho}`}
        lang={speechTag(local, week.household.hostCountry)}
        label={t("Parents.listen")}
        stopLabel={t("Parents.stopListening")}
        tone="secondary"
      />
    </div>
  );
}

export function FriendView() {
  const { parent, t, week } = useParents();
  const people = week.people.filter((p) => p.knownParentIds.includes(parent.id) && p.words.length > 0);
  return (
    <div className="space-y-6">
      <h1 className="text-[30px] font-semibold" lang="te">
        {t("Friend.title")}
      </h1>
      {people.map((p) => (
        <section key={p.id} aria-label={p.label} className="space-y-3">
          <h2 className="text-[24px] font-semibold" lang="te">
            {t("Friend.for", { name: p.label })}
          </h2>
          <ul className="space-y-3">
            {p.words.map((w) => (
              <li key={w.id} className="rounded-card bg-surface p-5 shadow-raised ring-1 ring-line">
                <p className="text-[36px] font-semibold" lang={p.language}>
                  {w.local} <span className="text-[22px] font-normal text-text-muted">{w.romanized}</span>
                </p>
                <p className="mt-2 text-[24px]" lang="te">
                  {w.pronunciation}
                </p>
                <p className="text-parent text-text-muted" lang="te">
                  {w.meaning}
                </p>
                <div className="mt-3">
                  <ListenButton
                    text={w.local}
                    lang={speechTag(p.language)}
                    label={t("Friend.play")}
                    stopLabel={t("Parents.stopListening")}
                    tone="secondary"
                    size="compact"
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
