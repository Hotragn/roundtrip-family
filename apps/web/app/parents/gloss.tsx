"use client";

import { useCallback, useEffect, useState } from "react";
import { useParents } from "./context";

/**
 * English hints for demo visitors. The parents' app is Telugu only; someone trying the demo who
 * reads English can turn on "Show English" in the demo strip, and the main buttons and headings
 * get a small English line under the Telugu. Off by default, remembered on this device, and
 * offered only on the demo households, so a parent's own screens never change.
 */
export const GLOSS: Record<string, string> = {
  "Parents.imHome": "I'm home",
  "Parents.diary": "Diary",
  "Parents.imLost": "I'm lost",
  "Parents.directions": "Directions",
  "Parents.showDriver": "Show the driver",
  "Parents.showSomeone": "Show someone",
  "Parents.practice": "Practice phrases",
  "Parents.listen": "Listen",
  "Parents.stopListening": "Stop",
  "Parents.back_to_today": "Back to today",
  "Parents.greetingMother": "Your plan for today",
  "Parents.greetingFather": "Your plan for today",
  "Parents.greetingMotherLater": "Your plan",
  "Parents.greetingFatherLater": "Your plan",
  "Parents.laterThisWeek": "This week",
  "Parents.noPlanToday": "No outing planned today.",
  "Parents.otherPhone": "Is this phone someone else's?",
  "Parents.stayMine": "No, it's mine",
  "Parents.changeOwner": "Yes, change it",
  "Directions.title": "Directions",
  "Directions.showWhere": "Show where I am",
  "Driver.hint": "Turn the phone toward the driver.",
  "Driver.hintSomeone": "Turn the phone toward someone nearby.",
  "Practice.title": "Practice these phrases",
  "Lost.show": "Show this card to anyone nearby.",
  "How.title": "How was it?",
  "How.talk": "Tap to talk",
  "How.stop": "Tap again to stop",
  "How.good": "Good",
  "How.okay": "Okay",
  "How.notGood": "Not good",
  "How.send": "Send",
  "Diary.title": "My diary",
  "Diary.record": "Tap and talk",
  "Diary.save": "Save",
  "Diary.book": "Memory book",
  "Diary.callChild": "Call your child",
  "Book.title": "Memory book",
  "Join.title": "Help joining",
  "Join.show": "Show this card to someone there.",
  "Join.askWho": "Who to ask",
  "Friend.title": "Three words for a new friend",
};

const STORE = "roundtrip:show-english";

/** The demo strip's switch state, kept in this browser. Storage can be blocked; then it's just off. */
export function useEnglishSwitch(allowed: boolean): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      setOn(allowed && localStorage.getItem(STORE) === "1");
    } catch {}
  }, [allowed]);
  const set = useCallback((next: boolean) => {
    setOn(next);
    try {
      if (next) localStorage.setItem(STORE, "1");
      else localStorage.removeItem(STORE);
    } catch {}
  }, []);
  return [allowed && on, set];
}

/** A message in Telugu, with its English hint under it when the switch is on. */
export function L({ k, values }: { k: string; values?: Record<string, string | number> }) {
  const { t, en } = useParents();
  const hint = en(k);
  if (!hint) return t(k, values);
  return (
    <span className="inline-block">
      {t(k, values)}
      <Hint text={hint} />
    </span>
  );
}

/** English hints for a Listen button, when the switch is on. */
export function listenGloss(en: (k: string) => string | undefined, label = "Parents.listen") {
  const l = en(label);
  return l ? { label: l, stop: en("Parents.stopListening") ?? "Stop" } : undefined;
}

export function Hint({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <span lang="en" className="block text-[15px] leading-snug font-normal">
      {text}
    </span>
  );
}
