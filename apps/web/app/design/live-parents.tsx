"use client";

import { speechTag } from "@roundtrip/core/languages";
import { format } from "date-fns";
import { te } from "date-fns/locale";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { TeluguProvider } from "@/app/parents/intl-provider";
import { legsOf, metaOf } from "@/app/parents/views/today";
import { BottomBar } from "@/components/parents/bottom-bar";
import { DriverCard, FeelingChips, LostCard, PhraseCard } from "@/components/parents/cards";
import { DiaryEntryCard, MemoryBookPage } from "@/components/parents/diary";
import { ListenButton } from "@/components/parents/listen-button";
import { StopCountdown } from "@/components/parents/stop-countdown";
import { Ticket } from "@/components/parents/ticket";
import type { DiarySeed } from "@/lib/diary-types";
import { fmtTime, placePhoto, type WeekView } from "@/lib/week";

/**
 * The parents' app components on the style guide, rendered with Sarala's real demo week (the
 * family is fictional; places and routes come from live search) and her synthetic diary.
 */

function Specimen({ name, children, wide }: { name: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <figure className={wide ? "md:col-span-2" : undefined}>
      <figcaption className="mb-2 font-mono text-[12px] text-text-muted">{name}</figcaption>
      <div className="rounded-card bg-paper p-4 ring-1 ring-line">{children}</div>
    </figure>
  );
}

function Gallery({ week, diary }: { week: WeekView; diary: DiarySeed[] }) {
  const t = useTranslations();
  const raw = useTranslations();
  const tt = (k: string, v?: Record<string, string | number>) => raw(k as never, v as never);
  const [home, setHome] = useState(false);
  const [feel, setFeel] = useState<string[]>(["బాగుంది"]);
  const parent = week.parents[0]!;
  const outing = week.outings.find((o) => o.route?.legs.some((l) => l.mode !== "walk")) ?? week.outings[0]!;
  const card = outing.cards[0]!;
  const h = week.household;
  const local = h.localLanguage;
  const speech = speechTag(local, h.hostCountry);
  const legs = outing.route?.legs ?? [];
  const lastTransit = legs.filter((l) => l.mode !== "walk").at(-1);
  const entry = diary[0];

  return (
    <div data-theme="road" data-scheme="light" lang="te" className="grid gap-6 text-text md:grid-cols-2">
      <Specimen name="Ticket, TravelLines and the stub" wide>
        <Ticket
          legs={legsOf(outing)}
          linesLabel={metaOf(outing, tt)}
          leave={fmtTime(outing.slot.depart)}
          back={fmtTime(outing.slot.back)}
          leaveLabel={t("Parents.leave")}
          backLabel={t("Parents.back")}
          photo={
            outing.photo
              ? { url: placePhoto(outing.photo.url, 288, 288), fallback: outing.photo.url, credit: "Google Maps" }
              : null
          }
          title={card.title}
          meta={metaOf(outing, tt)}
          home={home}
          stampLabel={t("Parents.stamp")}
          stub={
            <div className="flex flex-wrap gap-3">
              <ListenButton
                src={card.audio?.body}
                text={card.body}
                lang={speechTag(parent.language)}
                label={t("Parents.listen")}
                stopLabel={t("Parents.stopListening")}
              />
              <button
                type="button"
                onClick={() => setHome((x) => !x)}
                className="inline-flex min-h-14 items-center rounded-xl border border-line-strong px-5 text-parent font-semibold"
              >
                {t("Parents.imHome")}
              </button>
            </div>
          }
        />
      </Specimen>

      <Specimen name="StopCountdown">
        {lastTransit ? (
          <StopCountdown
            legs={legs}
            venue={outing.venue}
            gps="off"
            labels={{
              yourStop: t("Directions.yourStop"),
              pressAfter: (stop) => t("Directions.pressAfter", { stop }),
              stopsToGo: (n) => t("Directions.stopsToGo", { n }),
              walk: t("Parents.walk"),
              minutes: (n) => t("Parents.minutes", { n }),
            }}
          />
        ) : null}
      </Specimen>

      <Specimen name="DriverCard">
        <DriverCard
          lead={card.driver.lead}
          stopName={lastTransit?.to.name ?? card.driver.stopName}
          thanks={card.driver.thanks}
          localLanguage={local}
          speech={speech}
          labels={{
            hint: t("Driver.hint"),
            play: t("Driver.playLocal", { language: "English" }),
            stop: t("Parents.stopListening"),
          }}
        />
      </Specimen>

      <Specimen name="PhraseCard">
        <ul className="space-y-3">
          {card.phrases.slice(0, 2).map((p) => (
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
      </Specimen>

      <Specimen name="LostCard">
        <LostCard
          intro={t("Lost.show")}
          help={h.helpCardText}
          phrases={h.localPhrases}
          name={parent.firstName}
          homeArea={h.homeArea}
          phone={h.contact.phone}
          emergency={h.emergency}
          secondary={h.secondaryEmergency}
          localLanguage={local}
          speech={speech}
          labels={{
            callFamily: t("Lost.callFamily"),
            emergency: t("Lost.emergency"),
            noPlan: t("Lost.noPlan"),
            play: t("Parents.listen"),
            stop: t("Parents.stopListening"),
          }}
        />
      </Specimen>

      <Specimen name="FeelingChips and DiaryEntry">
        <div className="space-y-4">
          <FeelingChips
            words={["బాగుంది", "సంతోషం", "ఊరు గుర్తొచ్చింది", "అలిసిపోయా", "టెన్షన్"]}
            selected={feel}
            onToggle={(w) => setFeel((f) => (f.includes(w) ? f.filter((x) => x !== w) : [...f, w]))}
          />
          {entry ? (
            <ul>
              <DiaryEntryCard
                entry={{
                  id: entry.id,
                  createdAt: entry.createdAt,
                  text: entry.text,
                  audioSrc: entry.audioUrl,
                  feelingWords: entry.feelingWords,
                  shared: entry.shared,
                }}
                labels={{
                  shared: t("Diary.shared"),
                  private: t("Diary.private"),
                  share: t("Diary.share"),
                  unshare: t("Diary.unshare"),
                  delete: t("Diary.delete"),
                }}
                onShare={() => {}}
                onDelete={() => {}}
              />
            </ul>
          ) : null}
        </div>
      </Specimen>

      <Specimen name="MemoryBookPage">
        <MemoryBookPage
          label={t("Book.title")}
          empty={t("Book.empty")}
          items={diary
            .filter((d) => d.inMemoryBook)
            .slice(0, 2)
            .map((d) => ({
              id: d.id,
              date: format(new Date(d.createdAt), "d MMMM", { locale: te }),
              text: d.text,
              feelingWords: d.feelingWords,
            }))}
        />
      </Specimen>

      <Specimen name="BottomBar">
        {/* A transformed box keeps the bar's fixed position inside the specimen. */}
        <div className="relative h-28 overflow-hidden rounded-lg [transform:translateZ(0)]">
          <BottomBar
            labels={{ home: t("Parents.imHome"), diary: t("Parents.diary"), lost: t("Parents.imLost") }}
            onHome={() => {}}
            onDiary={() => {}}
            onLost={() => {}}
            homeActive
          />
        </div>
      </Specimen>
    </div>
  );
}

export function ParentsGallery({ week, diary }: { week: WeekView; diary: DiarySeed[] }) {
  return (
    <TeluguProvider>
      <Gallery week={week} diary={diary} />
    </TeluguProvider>
  );
}
