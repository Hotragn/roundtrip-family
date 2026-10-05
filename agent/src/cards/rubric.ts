/**
 * Code checks for a Telugu outing card (docs/card-style.md). The same rules live in
 * finetune/finetune/rubric.py; both test against evals/fixtures/rubric-cases.json.
 */

export const MAX_WORDS = 60;
const ADDRESS_FORMS: Record<string, string> = { mother: "అమ్మా", father: "నాన్నగారు" };
const RESPECTFUL = /(మీరు|మీకు|మీ |మిమ్మల్ని|ండి)/u;
const LATIN_RUN = /[A-Za-z][A-Za-z0-9&'.\- ]*[A-Za-z0-9]|[A-Za-z]/g;
const NUMBER = /\d+(?::\d+)?/g;

export interface CardInput {
  names: string[];
  numbers: string[];
  addressee: "mother" | "father";
  extraAllowed?: string[];
}

export interface RubricResult {
  passed: boolean;
  words: number;
  failures: string[];
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function checkCard(card: string, given: CardInput): RubricResult {
  const failures: string[] = [];
  const words = wordCount(card);
  if (words > MAX_WORDS) failures.push(`${words} words, more than ${MAX_WORDS}`);
  for (const name of given.names) if (!card.includes(name)) failures.push(`missing exact name: ${name}`);
  const allowedNumbers = new Set(given.numbers);
  for (const name of [...given.names, ...(given.extraAllowed ?? [])])
    for (const n of name.match(NUMBER) ?? []) allowedNumbers.add(n);
  for (const n of card.match(NUMBER) ?? []) if (!allowedNumbers.has(n)) failures.push(`number not in the input: ${n}`);
  const allowedLatin = [...given.names, ...(given.extraAllowed ?? [])].join(" ");
  for (const run of card.match(LATIN_RUN) ?? []) {
    const token = run.replace(/^[ .'-]+|[ .'-]+$/g, "");
    if (token && !allowedLatin.includes(token)) failures.push(`Latin-script text not in the input: ${token}`);
  }
  const form = ADDRESS_FORMS[given.addressee];
  if (form && !card.includes(form)) failures.push(`doesn't address the parent as ${form}`);
  if (!RESPECTFUL.test(card)) failures.push("no respectful మీరు form");
  return { passed: failures.length === 0, words, failures };
}
