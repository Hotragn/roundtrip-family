"use client";

import { Phone, Siren } from "lucide-react";
import { ListenButton } from "@/components/parents/listen-button";
import { cn } from "@/lib/utils";

/** The driver card: the stop name in large local-language text, to show the driver. */
export function DriverCard({
  lead,
  stopName,
  thanks,
  address,
  localLanguage,
  speech,
  labels,
}: {
  lead: string;
  stopName: string;
  thanks: string;
  address?: string;
  localLanguage: string;
  /** Speech tag for the local language, e.g. en-US. */
  speech: string;
  labels: { hint: string; play: string; stop: string };
}) {
  const spoken = `${lead} ${stopName}. ${thanks}`;
  return (
    <section aria-label={stopName} className="flex min-h-[calc(100dvh-180px)] flex-col justify-between">
      <div lang={localLanguage} className="pt-2">
        <p className="text-[30px] font-medium leading-tight">{lead}</p>
        <p className="mt-6 text-driver font-bold [overflow-wrap:anywhere]">{stopName}</p>
        {address ? <p className="mt-4 text-[26px] leading-snug text-text-muted">{address}</p> : null}
        <p className="mt-8 text-[30px] font-medium">{thanks}</p>
      </div>
      <div className="mt-8 space-y-4">
        <p className="text-parent text-text-muted" lang="te">
          {labels.hint}
        </p>
        <ListenButton text={spoken} lang={speech} label={labels.play} stopLabel={labels.stop} tone="secondary" />
      </div>
    </section>
  );
}

export function PhraseCard({
  local,
  pronunciation,
  meaning,
  audio,
  localLanguage,
  speech,
  labels,
}: {
  local: string;
  pronunciation: string;
  meaning: string;
  audio?: string;
  localLanguage: string;
  speech: string;
  labels: { say: string; means: string; play: string; stop: string };
}) {
  return (
    <li className="rounded-card bg-surface p-5 shadow-raised ring-1 ring-line">
      <p className="text-[28px] font-semibold leading-snug" lang={localLanguage}>
        {local}
      </p>
      <p className="mt-3 text-[15px] text-text-muted" lang="te">
        {labels.say}
      </p>
      <p className="text-[24px] leading-snug" lang="te">
        {pronunciation}
      </p>
      <p className="mt-3 text-[15px] text-text-muted" lang="te">
        {labels.means}
      </p>
      <p className="text-parent" lang="te">
        {meaning}
      </p>
      <div className="mt-4">
        <ListenButton
          src={audio}
          text={local}
          lang={speech}
          label={labels.play}
          stopLabel={labels.stop}
          tone="secondary"
          size="compact"
        />
      </div>
    </li>
  );
}

/** "I'm lost": a large card in the local language to show anyone nearby, with tap-to-call. */
export function LostCard({
  intro,
  help,
  phrases,
  name,
  homeArea,
  phone,
  emergency,
  secondary,
  helpAudio,
  localLanguage,
  speech,
  labels,
}: {
  intro: string;
  help: string;
  /** The household's fixed lines in the local language; {name} and {area} are filled in here. */
  phrases: { helpTitle: string; myName: string; stayingNear: string; callFamily: string };
  name: string;
  homeArea: string;
  phone: string;
  emergency: { number: string; covers: string };
  secondary: { number: string; covers: string } | null;
  /** The saved clip of the help text alone, for phones with no voice for the local language. */
  helpAudio?: string;
  localLanguage: string;
  speech: string;
  labels: { callFamily: string; emergency: string; noPlan: string; play: string; stop: string };
}) {
  const t = {
    title: phrases.helpTitle,
    name: phrases.myName.replace("{name}", name),
    near: phrases.stayingNear.replace("{area}", homeArea),
    call: phrases.callFamily,
  };
  const spoken = `${t.title} ${help} ${t.name} ${t.near} ${t.call} ${phone}.`;
  const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;
  return (
    <section className="space-y-5">
      <p className="text-parent" lang="te">
        {intro}
      </p>
      <div lang={localLanguage} className="rounded-ticket border-[3px] border-signal bg-surface p-6 shadow-raised">
        <p className="text-[36px] font-bold leading-tight text-signal-text">{t.title}</p>
        <p className="mt-4 text-[24px] leading-snug">{help}</p>
        <p className="mt-4 text-[24px] font-semibold">{t.name}</p>
        <p className="mt-1 text-[24px] leading-snug">{t.near}</p>
        <p className="mt-5 text-[22px]">{t.call}</p>
        <a
          href={tel(phone)}
          className="mt-1 block text-[38px] font-bold tabular-nums underline-offset-4 hover:underline"
        >
          {phone}
        </a>
      </div>
      <a
        href={tel(phone)}
        className="flex min-h-16 items-center justify-center gap-3 rounded-xl bg-ink px-6 text-parent font-semibold text-white"
        lang="te"
      >
        <Phone aria-hidden="true" className="size-6 stroke-[1.75]" />
        {labels.callFamily}
      </a>
      <a
        href={tel(emergency.number)}
        className="flex min-h-16 items-center justify-center gap-3 rounded-xl bg-signal px-6 text-parent font-semibold text-white"
      >
        <Siren aria-hidden="true" className="size-6 stroke-[1.75]" />
        <span lang="te">{labels.emergency}</span>
        <span className="tabular-nums">{emergency.number}</span>
      </a>
      {secondary ? (
        <a
          href={tel(secondary.number)}
          className="block text-center text-[19px] text-text-muted underline-offset-4 hover:underline"
        >
          {secondary.covers}: <span className="font-semibold tabular-nums text-text">{secondary.number}</span>
        </a>
      ) : null}
      <p className="text-[18px] text-text-muted" lang="te">
        {labels.noPlan}
      </p>
      <ListenButton
        text={spoken}
        fallbackSrc={helpAudio}
        lang={speech}
        label={labels.play}
        stopLabel={labels.stop}
        tone="secondary"
      />
    </section>
  );
}

/** Feeling words the parent taps themselves. The app never detects or scores feelings. */
export function FeelingChips({
  words,
  selected,
  onToggle,
}: {
  words: string[];
  selected: string[];
  onToggle: (w: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" lang="te">
      {words.map((w) => {
        const on = selected.includes(w);
        return (
          <button
            key={w}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(w)}
            className={cn(
              "min-h-12 rounded-full border px-4 text-[19px] transition-colors",
              on ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-text hover:bg-surface-sunken",
            )}
          >
            {w}
          </button>
        );
      })}
    </div>
  );
}
