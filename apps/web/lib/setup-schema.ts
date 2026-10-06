import { ClockTime, LanguageCode, ReadingSupport } from "@roundtrip/core";
import { z } from "zod";

/**
 * The household setup wizard's fields (docs/plan.md, Setup), in words a family would use. The
 * dashboard form and the save route share this schema. It holds only what setup asks: a first
 * name per parent, the nearest stop instead of an address, and one contact number.
 */

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const time = ClockTime.or(z.literal(""));

export const SetupParent = z
  .object({
    firstName: z.string().trim().min(1, "Their first name").max(40, "A first name only"),
    addressAs: z.string().trim().min(1, "How the cards address them").max(20),
    language: LanguageCode,
    readingSupport: ReadingSupport,
    maxWalkMinutes: z
      .number({ error: "Enter minutes" })
      .int("Whole minutes")
      .min(0, "0 or more")
      .max(120, "At most 2 hours"),
    transitComfort: z.enum(["none", "with_company", "solo_known_routes", "solo"]),
    bestStart: ClockTime,
    bestEnd: ClockTime,
    napStart: time,
    napEnd: time,
  })
  .refine((p) => p.bestStart < p.bestEnd, { path: ["bestEnd"], message: "The end comes after the start" })
  .refine((p) => (p.napStart === "") === (p.napEnd === ""), {
    path: ["napEnd"],
    message: "Give both times, or neither",
  });
export type SetupParent = z.infer<typeof SetupParent>;

export const SetupForm = z.object({
  hostCountry: z.string().regex(/^[A-Z]{2}$/),
  localLanguage: LanguageCode,
  searchLocation: z.string().trim().min(2, "The town or district, e.g. Fremont, California"),
  homeStop: z.string().trim().min(2, "The nearest bus stop or corner, e.g. Mowry Ave & Fremont Blvd"),
  parents: z.array(SetupParent).min(1, "At least one parent").max(2),
  alone: z.array(
    z
      .object({ day: z.enum(DAYS), on: z.boolean(), start: ClockTime, end: ClockTime })
      .refine((w) => !w.on || w.start < w.end, { path: ["end"], message: "The end comes after the start" }),
  ),
  trialRunDays: z.array(z.enum(["sat", "sun"])),
  contactLabel: z.string().trim().min(1, "How their app names you, e.g. Your child").max(30),
  contactPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 ()-]{6,19}$/, "A phone number with its country code, e.g. +1 510 555 0142"),
  phonePlan: z.enum(["wifi_only", "local_plan"]),
});
export type SetupForm = z.infer<typeof SetupForm>;

export const READING: Record<z.infer<typeof ReadingSupport>, { label: string; hint: string }> = {
  audio_first: { label: "Listens first", hint: "Hears each ticket read aloud, then reads it in their script" },
  text_with_sign_words: {
    label: "Reads, and knows some sign words",
    hint: "Reads their script and matches local words on signs",
  },
  text: { label: "Reads their script", hint: "Reads tickets in their own script comfortably" },
};

export const TRANSIT: Record<SetupForm["parents"][number]["transitComfort"], string> = {
  none: "Not by bus or train yet",
  with_company: "With someone along",
  solo_known_routes: "On their own, on routes they know",
  solo: "On their own, anywhere",
};
