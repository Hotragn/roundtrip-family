"use client";

import { CheckCircle2, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Panel } from "@/components/shell/panel";
import { buttonVariants } from "@/components/ui/button";
import type { PlanBoard } from "@/lib/plan-types";
import { cn } from "@/lib/utils";

const KEY = "roundtrip:guide-dismissed";
// The buttons' labels wrap on a narrow phone instead of pushing the page sideways.
const WRAP = "h-auto min-h-11 max-w-full shrink whitespace-normal py-2 text-left";

/**
 * A first-visit guide to the dashboard in three steps, for someone who has never seen it. Hidden
 * once dismissed (remembered on this browser only); without storage it simply shows again.
 * It's in the server HTML so the board below never jumps; for a returning visitor the inline
 * script hides it before the first paint.
 */
const HIDE = `try{if(localStorage.getItem("${KEY}")==="1")document.currentScript.nextElementSibling.hidden=true}catch(e){}`;

export function FirstVisitGuide({ board }: { board: PlanBoard }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "1") setOpen(false);
    } catch {}
  }, []);
  if (!open) return null;
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
  };
  const first = board.parents[0];
  const steps = [
    {
      title: "Look at the week",
      text: `Each card is a real place near ${board.household.metroArea}, picked for ${board.parents
        .map((p) => p.firstName)
        .join(" and ")}. Open one to see why, the route on a map, and what they'll see on their phone.`,
    },
    {
      title: "Approve or swap",
      text: "Approve the outings you like, or swap one for another option. Drag a card to move it to another day.",
    },
    {
      title: "Watch it reach their phone",
      text: `An approved outing appears on their phone as a ticket in their language. When they tap "I'm home", you see it in Their week.`,
    },
  ];
  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed string, no user input */}
      <script dangerouslySetInnerHTML={{ __html: HIDE }} />
      <Panel role="region" className="relative p-5 sm:p-6" aria-labelledby="guide-title">
        <button
          type="button"
          onClick={close}
          aria-label="Close the guide"
          className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-lg text-text-muted hover:bg-surface-sunken"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
        <h2 id="guide-title" className="pr-12 text-[20px] font-semibold">
          New here? How this works in three steps
        </h2>
        <p className="mt-1 text-[15px] text-text-muted">
          This is a demo week for a fictional family, so try anything: nothing is sent and nothing is saved for long.
        </p>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bus text-[15px] font-semibold text-on-bus"
              >
                {i + 1}
              </span>
              <div>
                <p className="font-semibold">{s.title}</p>
                <p className="mt-0.5 text-[15px] leading-relaxed text-text-muted">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-3">
          {first ? (
            <a
              href={`/parents/${board.household.slug}/${first.id}`}
              target="_blank"
              rel="noopener"
              className={cn(buttonVariants({ variant: "secondary" }), WRAP)}
            >
              <Smartphone aria-hidden="true" className="size-4" />
              Open {first.firstName}'s phone beside this
            </a>
          ) : null}
          <button type="button" onClick={close} className={cn(buttonVariants({ variant: "secondary" }), WRAP)}>
            <CheckCircle2 aria-hidden="true" className="size-4" />
            Got it
          </button>
        </div>
      </Panel>
    </>
  );
}
