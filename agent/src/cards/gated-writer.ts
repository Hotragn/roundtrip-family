import { type Gemma, gemma } from "../gemma";
import { judgeCard } from "./judge";
import type { CardFacts, CardWriter, WrittenCard } from "./writer";

/**
 * The quality gate the training data passed (docs/card-style.md, "The quality gate"), applied to
 * every card a parent gets: the rubric and script checks, Gemma's tone of 4 or 5 with nothing the
 * outing doesn't support (agent/src/cards/judge.ts), and, when the walk from the last stop is five
 * minutes or more, its minutes in the card, since a parent who listens first hears only the card.
 * The writers are tried in order; the first card with no problems is used, and when none passes,
 * the one with the fewest.
 */

export interface GateResult {
  writer: WrittenCard["writer"]["kind"];
  problems: string[];
}

export class GatedCardWriter implements CardWriter {
  constructor(
    private readonly writers: CardWriter[],
    private readonly g: Gemma = gemma(),
    private readonly onRejected: (facts: CardFacts, result: GateResult) => void = () => {},
  ) {}

  async write(facts: CardFacts): Promise<WrittenCard> {
    let best: { card: WrittenCard; problems: string[] } | null = null;
    for (const writer of this.writers) {
      const card = await writer.write(facts);
      const problems = await this.problems(facts, card);
      if (problems.length === 0) return card;
      this.onRejected(facts, { writer: card.writer.kind, problems });
      if (!best || problems.length < best.problems.length) best = { card, problems };
    }
    if (!best) throw new Error("GatedCardWriter needs at least one writer.");
    return best.card;
  }

  /** What keeps a card from a parent. The judge runs only on cards that pass the code checks. */
  async problems(facts: CardFacts, card: WrittenCard): Promise<string[]> {
    const out = [...card.rubric.failures];
    if (!card.rubric.scriptOk) out.push("broken Telugu script");
    const walk = facts.walkToPlace;
    const numbers: string[] = card.body.match(/\d+(?::\d+)?/g) ?? [];
    if (walk !== undefined && walk >= 5 && !numbers.includes(String(walk)))
      out.push(`doesn't say the ${walk}-minute walk from the stop`);
    if (out.length > 0) return out;
    const v = await judgeCard(facts, card, this.g);
    if (v.tone < 4) out.push(`tone ${v.tone}${v.problem ? `: ${v.problem}` : ""}`);
    if (!v.factsOk) out.push(`facts don't hold${v.problem ? `: ${v.problem}` : ""}`);
    return out;
  }
}
