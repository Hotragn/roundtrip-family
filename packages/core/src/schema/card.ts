import { z } from "zod";
import { IsoDateTime, LanguageCode, Provenance } from "./common";

export const Phrase = z.object({
  id: z.string(),
  /** The phrase in the household's local language, e.g. "Where is the bathroom?". */
  local: z.string(),
  /** How to say it, written in the parent's script, e.g. "వేర్ ఈజ్ ద బాత్‌రూమ్?". */
  pronunciation: z.string(),
  /** What it means, in the parent's language. */
  meaning: z.string(),
  audio: z.object({ local: z.string().optional() }).default({}),
});
export type Phrase = z.infer<typeof Phrase>;

export const CardStep = z.object({
  /** The step in the parent's language, with bus, street and venue names in English. */
  text: z.string(),
  mode: z.enum(["walk", "bus", "rail", "wait", "arrive"]),
  /** Stops to count on a transit leg. */
  stops: z.number().int().min(0).optional(),
  /** Local-language words the parent will see on signs for this step. */
  signWords: z.array(z.string()).default([]),
  audio: z.string().optional(),
});
export type CardStep = z.infer<typeof CardStep>;

export const Card = z.object({
  _id: z.string(),
  outingId: z.string(),
  parentId: z.string(),
  provenance: Provenance,
  language: LanguageCode,
  localLanguage: LanguageCode,
  /** Ticket title in the parent's language. */
  title: z.string(),
  /** The card text, 60 words or fewer, in the parent's language. */
  body: z.string(),
  /** The driver card in the local language. */
  driver: z.object({
    lead: z.string(),
    stopName: z.string(),
    thanks: z.string(),
    audio: z.string().optional(),
  }),
  phrases: z.array(Phrase).length(3),
  steps: z.array(CardStep),
  /** Short tip on the first card: never share bank details or pay strangers. */
  scamTip: z.string().optional(),
  /** Help joining: an English card for joining a group or volunteering, plus who to ask. */
  joinCard: z
    .object({
      local: z.string(),
      askWho: z.string(),
      meaning: z.string(),
      audio: z.string().optional(),
    })
    .optional(),
  audio: z.object({ title: z.string().optional(), body: z.string().optional() }).default({}),
  writer: z.object({
    kind: z.enum(["tinker_lora", "tinker_base", "gemma", "fixture"]),
    model: z.string(),
    latencyMs: z.number().optional(),
  }),
  createdAt: IsoDateTime,
});
export type Card = z.infer<typeof Card>;
