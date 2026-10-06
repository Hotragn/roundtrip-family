import { z } from "zod";
import { type ChatMessage, type Gemma, gemma, parseJson } from "../gemma";
import type { Tinker } from "../tinker/client";
import type { CardFacts } from "./writer";

/**
 * Gemma as the judge of Telugu cards (docs/card-style.md, "The quality gate"). Gemma is a
 * different model family from the Qwen card writer and its Qwen teacher, so it isn't grading its
 * own family's work. Two jobs:
 * - judgeCard: tone and register from 1 to 5, plus whether everything the card says is supported
 *   by the outing. A teacher draft passes the gate with tone 4 or 5 and facts that hold.
 * - judgePair: which of two cards for the same outing serves the parent better. Callers ask twice
 *   with the cards swapped and count a win only when both orders agree.
 * The instructions are fixed and come first; every call is cached by its prompt like all Gemma calls.
 */

export const CARD_JUDGE_PROMPT = `You review one short outing card written in Telugu for a parent who is visiting family abroad. You read Telugu well and know how people in Guntur, coastal Andhra, speak.

Rate the card's tone and register from 1 to 5:
5: warm and respectful, like a neighbor's daughter talking to an elder; natural coastal Andhra Telugu with respectful మీరు forms and plain everyday words. A parent would be glad to get it.
4: good, with one small wobble, such as a slightly stiff word or one awkward phrase.
3: understandable but stiff, bookish or odd in places, or a few English words besides names.
2: the wrong register (formal like a bank officer, childish or bossy), Telangana forms, or clumsy throughout.
1: broken, rude, pitying, or not Telugu.
Lower the score for talking down to them, pity, flattery, saying they will be lonely or need help, Sanskritized formal words where an everyday word exists, and English words other than names. Do not lower it for bus, street, stop and venue names written in English letters: they must stay that way so they match the signs.

Then check the card against the outing details. factsOk is false when the card says anything the details don't support or gets something wrong: the day, a time, the bus line, where to get on or off, the number of stops, a walk, the place, or what is there. Leaving a detail out is fine.

Answer with only JSON: {"tone": 1-5, "factsOk": true or false, "problem": "the main problem in a few English words, or an empty string"}`;

export const PAIR_JUDGE_PROMPT = `You compare two outing cards written in Telugu for the same parent and the same outing. You read Telugu well and know how people in Guntur, coastal Andhra, speak.

A good card:
- is warm and respectful, like a neighbor's daughter talking to an elder, in natural coastal Andhra Telugu with respectful మీరు forms, never stiff, pitying or flattering;
- addresses a mother as అమ్మా or a father as నాన్నగారు, once, at the start;
- keeps every bus, street, stop and venue name exactly as given, in English letters, and uses no other English words;
- says only what the outing details support, with no invented times, prices, people or programs;
- says clearly when to leave and how to get there, gives one reason they'd enjoy it, and ends with when they'll be back;
- has 60 words or fewer.

Decide which card serves the parent better. The order of the two cards is random, so judge only what they say. Answer "tie" only when they are equally good.

Answer with only JSON: {"better": "A", "B" or "tie", "reason": "a few English words"}`;

export const CardVerdict = z.object({
  tone: z.number().int().min(1).max(5),
  factsOk: z.boolean(),
  problem: z.string().max(400),
});
export type CardVerdict = z.infer<typeof CardVerdict>;

export const PairVerdict = z.object({ better: z.enum(["A", "B", "tie"]), reason: z.string().max(400) });
export type PairVerdict = z.infer<typeof PairVerdict>;

export interface CardText {
  title: string;
  body: string;
}

/** The outing as the judge sees it: the facts the writer was given, without the writer's instructions. */
export function outingDetails(f: CardFacts): string {
  return [
    `Parent: the ${f.addressee}, addressed as ${f.addressAs}`,
    `Venue: ${f.venue}`,
    `When: ${f.day}, leave at ${f.departTime}, back by ${f.backTime}`,
    `Trip: ${f.trip}`,
    `What's there: ${f.whatsThere}`,
    f.firstCard
      ? "First card of the visit: it should end with a one-line tip never to share bank details or pay a stranger."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function cardJudgeMessages(facts: CardFacts, card: CardText): ChatMessage[] {
  return [
    { role: "system", content: CARD_JUDGE_PROMPT },
    {
      role: "user",
      content: `Outing details:\n${outingDetails(facts)}\n\nCard title: ${card.title}\nCard body: ${card.body}`,
    },
  ];
}

export function pairJudgeMessages(facts: CardFacts, a: CardText, b: CardText): ChatMessage[] {
  return [
    { role: "system", content: PAIR_JUDGE_PROMPT },
    {
      role: "user",
      content: `Outing details:\n${outingDetails(facts)}\n\nCard A\nTitle: ${a.title}\nBody: ${a.body}\n\nCard B\nTitle: ${b.title}\nBody: ${b.body}`,
    },
  ];
}

export async function judgeCard(
  facts: CardFacts,
  card: CardText,
  g: Gemma = gemma(),
): Promise<CardVerdict & { latencyMs: number; cached: boolean }> {
  const res = await g.chatJson({
    purpose: "card:judge",
    dataClass: "synthetic",
    schema: CardVerdict,
    schemaName: "card_verdict",
    temperature: 0,
    maxTokens: 150,
    messages: cardJudgeMessages(facts, card),
  });
  return { ...res.data, latencyMs: res.latencyMs, cached: res.cached };
}

export async function judgePair(
  facts: CardFacts,
  a: CardText,
  b: CardText,
  g: Gemma = gemma(),
): Promise<PairVerdict & { latencyMs: number; cached: boolean }> {
  const res = await g.chatJson({
    purpose: "card:judge-pair",
    dataClass: "synthetic",
    schema: PairVerdict,
    schemaName: "pair_verdict",
    temperature: 0,
    maxTokens: 150,
    messages: pairJudgeMessages(facts, a, b),
  });
  return { ...res.data, latencyMs: res.latencyMs, cached: res.cached };
}

/** Kimi writes long reasons: keep the verdict and cut the reason instead of rejecting it. */
const LenientPairVerdict = z.object({ better: z.enum(["A", "B", "tie"]), reason: z.string() });

/**
 * The same pairwise prompt sent to a Tinker model of a third family (Kimi-K2.6), for pairs where
 * Gemma would be judging a card Gemma wrote. Goes through agent/src/tinker/client.ts: spend cap,
 * ledger and cache. An answer cut off at 150 tokens is asked again with room for 400.
 */
export async function judgePairOnTinker(
  facts: CardFacts,
  a: CardText,
  b: CardText,
  tinker: Tinker,
  model = "moonshotai/Kimi-K2.6",
): Promise<PairVerdict & { latencyMs: number; cached: boolean }> {
  let error = "";
  for (const maxTokens of [150, 400]) {
    const res = await tinker.chat({
      model,
      messages: pairJudgeMessages(facts, a, b),
      purpose: "card:judge-pair",
      dataClass: "synthetic",
      temperature: 0,
      maxTokens,
    });
    const parsed = parseJson(res.text, LenientPairVerdict);
    if (parsed.ok)
      return {
        better: parsed.data.better,
        reason: parsed.data.reason.slice(0, 400),
        latencyMs: res.latencyMs,
        cached: res.cached,
      };
    error = parsed.error;
  }
  throw new Error(`${model} returned no verdict: ${error}`);
}
