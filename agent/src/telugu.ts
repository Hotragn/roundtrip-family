/**
 * Telugu script integrity. A vowel sign, virama or other combining mark must follow a base
 * letter; text must survive NFC normalization unchanged; no replacement characters. These
 * catch broken conjuncts and vowel signs that a model or a pipeline step can introduce.
 */

/** Written as code points so the invisible joiners stay visible in source. */
const REPLACEMENT = String.fromCharCode(0xfffd);
const ZWNJ = String.fromCharCode(0x200c);
const ZWJ = String.fromCharCode(0x200d);

const TELUGU_LETTER = /[అ-హౘ-ౚౠౡ]/u;
/** Combining marks in the Telugu block: signs, virama, length marks, and the nukta-like marks. */
const TELUGU_MARK = /[ఀ-ఄ఼ా-ౖౢౣ]/u;

export interface ScriptReport {
  ok: boolean;
  nfcStable: boolean;
  replacementChars: number;
  orphanMarks: number;
  /** Share of letters that are Telugu, ignoring Latin names, digits and punctuation. */
  teluguShare: number;
}

export function checkTeluguScript(text: string): ScriptReport {
  const nfcStable = text === text.normalize("NFC");
  const replacementChars = [...text].filter((c) => c === REPLACEMENT).length;
  let orphanMarks = 0;
  const chars = [...text];
  chars.forEach((c, i) => {
    if (!TELUGU_MARK.test(c)) return;
    const prev = chars[i - 1];
    const prevOk =
      prev !== undefined && (TELUGU_LETTER.test(prev) || TELUGU_MARK.test(prev) || prev === ZWNJ || prev === ZWJ);
    if (!prevOk) orphanMarks++;
  });
  const letters = chars.filter((c) => /\p{L}/u.test(c) || TELUGU_MARK.test(c));
  const telugu = letters.filter((c) => TELUGU_LETTER.test(c) || TELUGU_MARK.test(c));
  const teluguShare = letters.length ? telugu.length / letters.length : 0;
  return {
    ok: nfcStable && replacementChars === 0 && orphanMarks === 0,
    nfcStable,
    replacementChars,
    orphanMarks,
    teluguShare,
  };
}
