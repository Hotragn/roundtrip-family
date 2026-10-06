/**
 * Approve by reply: reads the adult child's answer to the planning email. It understands "yes",
 * "approve all", "approve 1 and 3", "skip 2" and "swap 2", and combinations such as "yes but
 * skip 2" or "approve 1 and 3, swap 2". It reads only the first lines that look like an answer,
 * so a greeting or a signature doesn't get in the way. Anything it can't read with certainty
 * is "unclear", and the workflow replies asking again: it never guesses.
 *
 * AgentMail strips quoted history into extracted_text; callers pass that, or text when it's
 * missing (docs.agentmail.to/reply-extraction).
 */

export interface ReplyDecision {
  kind: "decision";
  /** "all", or the numbers to approve. */
  approve: "all" | number[];
  /** "all" to approve nothing this week, or the numbers to leave out. */
  skip: "all" | number[];
  /** Numbers to replace with the planner's next option. */
  swap: number[];
}

export type ParsedReply = ReplyDecision | { kind: "unclear"; why: string };

type Action = "approve" | "skip" | "swap";

const APPROVE = new Set([
  "yes",
  "y",
  "yep",
  "yeah",
  "yup",
  "ok",
  "okay",
  "sure",
  "approve",
  "approved",
  "accept",
  "accepted",
  "confirm",
  "confirmed",
  "agree",
  "agreed",
  "fine",
  "good",
  "great",
  "perfect",
  "book",
  "keep",
  "go",
  "do",
]);
const SKIP = new Set(["skip", "skipped", "drop", "remove", "cancel", "not", "without", "except", "exclude", "leave"]);
/** Saying no to the whole week. */
const DECLINE = new Set(["no", "nope"]);
const SWAP = new Set(["swap", "change", "replace", "switch", "instead", "alternative", "another", "different", "else"]);
/** Applies to the word before it: "approve all", "skip all". */
const ALL = new Set(["all", "everything", "every", "both", "them"]);
/** The ones not mentioned go ahead: "skip 2, the rest are fine". */
const REST = new Set(["rest", "others", "remaining"]);
const FILLER = new Set([
  "and",
  "or",
  "the",
  "a",
  "an",
  "outing",
  "outings",
  "number",
  "numbers",
  "please",
  "pls",
  "for",
  "to",
  "of",
  "one",
  "ones",
  "only",
  "just",
  "this",
  "these",
  "that",
  "those",
  "it",
  "is",
  "are",
  "i",
  "we",
  "me",
  "us",
  "would",
  "like",
  "can",
  "let",
  "lets",
  "s",
  "with",
  "also",
  "too",
  "then",
  "but",
  "out",
  "week",
  "plan",
  "ahead",
  "option",
  "something",
  "hi",
  "hello",
  "hey",
  "dear",
]);
const ORDINAL: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 };

/** Common phrases rewritten to the words above before reading. */
const PHRASES: Array<[RegExp, string]> = [
  [/\bno\.\s*(?=\d)/g, " "],
  // "No, just 1 and 3": a leading "no," is an interjection, not "skip".
  [/^\s*(no|nope)\s*[,.!;:-]\s*(?=[a-z0-9])/, " "],
  [/\b(no problem|no worries|not a problem)\b/g, " "],
  [/\bthank(s| you)\b/g, " "],
  [/\b(sounds|looks|all) (good|great|fine|perfect|set)\b/g, " yes "],
  [/\bgo ahead\b/g, " yes "],
  [/\b(all|everything) (but|except)\b/g, " yes skip "],
  [/\bnot this week\b/g, " skip all "],
  [/\bnone\b/g, " skip all "],
];

const QUOTE_START = [
  /^on .+wrote:?$/i,
  /^-{2,}\s*original message/i,
  /^from:\s/i,
  /^sent from my/i,
  /^-- ?$/,
  /^_{5,}$/,
];

function normalize(line: string): string {
  let t = ` ${line.toLowerCase().replace(/&/g, " and ")} `;
  for (const [re, to] of PHRASES) t = t.replace(re, to);
  return t;
}

function tokens(line: string): string[] {
  return normalize(line)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function looksLikeAnswer(line: string): boolean {
  return tokens(line).some(
    (t) =>
      /^\d+$/.test(t) ||
      t in ORDINAL ||
      APPROVE.has(t) ||
      SKIP.has(t) ||
      DECLINE.has(t) ||
      SWAP.has(t) ||
      ALL.has(t) ||
      REST.has(t),
  );
}

/** The lines that hold the answer: after any greeting, before any sign-off or quoted email. */
export function answerLines(raw: string): string[] {
  const lines: string[] = [];
  let started = false;
  for (const rawLine of raw.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith(">")) break;
    if (QUOTE_START.some((re) => re.test(line))) break;
    if (!line) {
      if (started) break;
      continue;
    }
    if (!looksLikeAnswer(line)) {
      if (started) break;
      continue;
    }
    started = true;
    lines.push(line);
  }
  return lines;
}

const ASK = "Which outings should go ahead?";

/** Reads a reply. With `count`, numbers outside 1 to count are unclear. */
export function parseReply(raw: string, opts: { count?: number } = {}): ParsedReply {
  const lines = answerLines(raw);
  if (!lines.length) return { kind: "unclear", why: ASK };

  const lists: Record<Action, number[]> = { approve: [], skip: [], swap: [] };
  const seen: Record<Action, boolean> = { approve: false, skip: false, swap: false };
  const all = { approve: false, skip: false };
  let declined = false;
  let current: Action | null = null;

  for (const t of lines.flatMap(tokens)) {
    const n = /^\d+$/.test(t) ? Number(t) : ORDINAL[t];
    if (n !== undefined) {
      const action: Action = current ?? "approve";
      seen[action] = true;
      lists[action].push(n);
      continue;
    }
    if (APPROVE.has(t)) current = "approve";
    else if (SKIP.has(t)) current = "skip";
    else if (SWAP.has(t)) current = "swap";
    else if (DECLINE.has(t)) {
      current = "skip";
      declined = true;
    } else if (REST.has(t)) {
      // "skip the rest" applies to its verb; "skip 2, the rest are fine" starts a new clause.
      const action: "approve" | "skip" = current === "skip" && !lists.skip.length ? "skip" : "approve";
      all[action] = true;
      seen[action] = true;
      current = action;
      continue;
    } else if (ALL.has(t)) {
      let action: "approve" | "skip" = current === "skip" ? "skip" : "approve";
      // "swap all" can't be done; "swap 2, all good otherwise" approves the others.
      if (current === "swap") {
        if (!lists.swap.length) return { kind: "unclear", why: 'Say which one to swap, for example "swap 2".' };
        action = "approve";
      }
      all[action] = true;
      seen[action] = true;
      current = action;
      continue;
    } else if (FILLER.has(t)) continue;
    else return { kind: "unclear", why: ASK };
    seen[current] = true;
  }

  const approveAll = all.approve || (seen.approve && lists.approve.length === 0);
  const skipAll = all.skip || (declined && lists.skip.length === 0 && !seen.approve && !seen.swap);
  if (seen.skip && !skipAll && lists.skip.length === 0) {
    return { kind: "unclear", why: 'Say which one to skip, for example "skip 2".' };
  }
  if (seen.swap && lists.swap.length === 0) {
    return { kind: "unclear", why: 'Say which one to swap, for example "swap 2".' };
  }
  if (approveAll && skipAll) return { kind: "unclear", why: ASK };
  if (skipAll && lists.swap.length) return { kind: "unclear", why: ASK };

  const numbers = [...lists.approve, ...lists.skip, ...lists.swap];
  const count = opts.count;
  const outside = count === undefined ? undefined : numbers.find((x) => x < 1 || x > count);
  if (outside !== undefined) {
    return {
      kind: "unclear",
      why:
        count === 1
          ? `There's no outing ${outside} this week. There's only outing 1.`
          : `There's no outing ${outside} this week. The outings are numbered 1 to ${count}.`,
    };
  }
  const twice = numbers.find((x, i) => numbers.indexOf(x) !== i);
  if (twice !== undefined) {
    const where = (a: Action) => lists[a].includes(twice);
    if (
      (where("approve") && where("skip")) ||
      (where("approve") && where("swap")) ||
      (where("skip") && where("swap"))
    ) {
      return { kind: "unclear", why: `Outing ${twice} appears twice. Should it go ahead, be skipped or be swapped?` };
    }
  }

  const uniq = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);
  // "Skip all, but approve 1" is the same as "approve 1".
  if (skipAll && lists.approve.length) return { kind: "decision", approve: uniq(lists.approve), skip: [], swap: [] };
  return {
    kind: "decision",
    approve: approveAll ? "all" : uniq(lists.approve),
    skip: skipAll ? "all" : uniq(lists.skip),
    swap: uniq(lists.swap),
  };
}

/** "1 and 3", "1, 2 and 4". */
export function numberList(ns: number[]): string {
  if (ns.length <= 1) return ns.join("");
  return `${ns.slice(0, -1).join(", ")} and ${ns.at(-1)}`;
}
