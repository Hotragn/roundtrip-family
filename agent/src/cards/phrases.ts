import type { Phrase } from "@roundtrip/core";

/**
 * Practice phrases in the household's local language, with how to say them in Telugu script and
 * what they mean in Telugu. These are written and checked by hand, because strangers hear them;
 * the card writer picks which three an outing needs. Defaults come from docs/persona.md.
 */

type Entry = Omit<Phrase, "audio">;

export const PHRASES: Record<string, Record<string, Entry>> = {
  en: {
    bathroom: {
      id: "bathroom",
      local: "Where is the bathroom?",
      pronunciation: "వేర్ ఈజ్ ద బాత్‌రూమ్?",
      meaning: "బాత్‌రూమ్ ఎక్కడ ఉంది?",
    },
    help: { id: "help", local: "I need help.", pronunciation: "ఐ నీడ్ హెల్ప్.", meaning: "నాకు సహాయం కావాలి." },
    call: {
      id: "call",
      local: "Please call this number.",
      pronunciation: "ప్లీజ్ కాల్ దిస్ నంబర్.",
      meaning: "దయచేసి ఈ నంబర్‌కి ఫోన్ చేయండి.",
    },
    how_much: { id: "how_much", local: "How much?", pronunciation: "హౌ మచ్?", meaning: "ఎంత?" },
    dont_understand: {
      id: "dont_understand",
      local: "I don't understand.",
      pronunciation: "ఐ డోంట్ అండర్‌స్టాండ్.",
      meaning: "నాకు అర్థం కాలేదు.",
    },
    shoes: {
      id: "shoes",
      local: "Where do I leave my shoes?",
      pronunciation: "వేర్ డూ ఐ లీవ్ మై షూస్?",
      meaning: "చెప్పులు ఎక్కడ విడవాలి?",
    },
    this_bus: {
      id: "this_bus",
      local: "Does this bus go to this stop?",
      pronunciation: "డజ్ దిస్ బస్ గో టు దిస్ స్టాప్?",
      meaning: "ఈ బస్సు ఈ స్టాప్‌కి వెళ్తుందా?",
    },
    join: { id: "join", local: "Can I join?", pronunciation: "కెన్ ఐ జాయిన్?", meaning: "నేను కూడా చేరవచ్చా?" },
    slowly: {
      id: "slowly",
      local: "Please speak slowly.",
      pronunciation: "ప్లీజ్ స్పీక్ స్లోలీ.",
      meaning: "దయచేసి నెమ్మదిగా మాట్లాడండి.",
    },
  },
  de: {
    bathroom: {
      id: "bathroom",
      local: "Wo ist die Toilette?",
      pronunciation: "వో ఇస్ట్ డీ టొయిలెట్టె?",
      meaning: "టాయిలెట్ ఎక్కడ ఉంది?",
    },
    help: { id: "help", local: "Ich brauche Hilfe.", pronunciation: "ఇష్ బ్రౌఖె హిల్ఫె.", meaning: "నాకు సహాయం కావాలి." },
    call: {
      id: "call",
      local: "Bitte rufen Sie diese Nummer an.",
      pronunciation: "బిట్టె రూఫెన్ జీ డీజె నుమ్మర్ ఆన్.",
      meaning: "దయచేసి ఈ నంబర్‌కి ఫోన్ చేయండి.",
    },
    how_much: { id: "how_much", local: "Wie viel kostet das?", pronunciation: "వీ ఫీల్ కోస్టెట్ దాస్?", meaning: "దీని ధర ఎంత?" },
    dont_understand: {
      id: "dont_understand",
      local: "Ich verstehe das nicht.",
      pronunciation: "ఇష్ ఫెర్‌ష్టేయె దాస్ నిష్ట్.",
      meaning: "నాకు అర్థం కాలేదు.",
    },
    shoes: {
      id: "shoes",
      local: "Wo kann ich meine Schuhe lassen?",
      pronunciation: "వో కాన్ ఇష్ మైనె షూయె లాస్సెన్?",
      meaning: "చెప్పులు ఎక్కడ విడవాలి?",
    },
    this_bus: {
      id: "this_bus",
      local: "Fährt dieser Bus zu dieser Haltestelle?",
      pronunciation: "ఫేర్ట్ డీజర్ బుస్ త్సు డీజర్ హాల్టెష్టెల్లె?",
      meaning: "ఈ బస్సు ఈ స్టాప్‌కి వెళ్తుందా?",
    },
    join: { id: "join", local: "Darf ich mitmachen?", pronunciation: "దార్ఫ్ ఇష్ మిట్‌మాఖెన్?", meaning: "నేను కూడా చేరవచ్చా?" },
    slowly: {
      id: "slowly",
      local: "Bitte sprechen Sie langsam.",
      pronunciation: "బిట్టె ష్ప్రెషెన్ జీ లాంగ్‌సామ్.",
      meaning: "దయచేసి నెమ్మదిగా మాట్లాడండి.",
    },
  },
};

/** The three phrases an outing needs, by kind of place. */
export function phrasesFor(category: string, localLanguage: string, rideBus: boolean): Entry[] {
  const book = PHRASES[localLanguage] ?? PHRASES.en!;
  const pick = (ids: string[]) => ids.map((id) => book[id]!).filter(Boolean);
  switch (category) {
    case "temple":
      return pick(["shoes", "bathroom", "call"]);
    case "indian_grocery":
    case "asian_grocery":
    case "farmers_market":
      return pick(["how_much", "dont_understand", "call"]);
    case "senior_center":
    case "library":
    case "community_meeting":
      return pick(["join", "slowly", "bathroom"]);
    case "park":
      return pick(["bathroom", "help", "call"]);
    default:
      return pick(rideBus ? ["this_bus", "bathroom", "call"] : ["bathroom", "help", "call"]);
  }
}

/** Driver card words by local language. */
export const DRIVER: Record<string, { lead: string; thanks: string }> = {
  en: { lead: "Please tell me when we reach:", thanks: "Thank you." },
  de: { lead: "Bitte sagen Sie mir Bescheid, wenn wir hier sind:", thanks: "Danke schön." },
};

/** Three words for a new friend, by the friend's language. */
export const FRIEND_WORDS: Record<
  string,
  Array<{ id: string; local: string; romanized: string; pronunciation: string; meaning: string }>
> = {
  zh: [
    { id: "hello", local: "你好", romanized: "nǐ hǎo", pronunciation: "నీ హావ్", meaning: "నమస్కారం" },
    { id: "thanks", local: "谢谢", romanized: "xièxie", pronunciation: "షియె షియె", meaning: "ధన్యవాదాలు" },
    { id: "delicious", local: "好吃", romanized: "hǎo chī", pronunciation: "హావ్ చి", meaning: "చాలా రుచిగా ఉంది" },
  ],
  de: [
    { id: "hello", local: "Hallo", romanized: "hallo", pronunciation: "హలో", meaning: "నమస్కారం" },
    { id: "thanks", local: "Danke", romanized: "danke", pronunciation: "డాంకె", meaning: "ధన్యవాదాలు" },
    { id: "delicious", local: "Lecker", romanized: "lecker", pronunciation: "లెక్కర్", meaning: "చాలా రుచిగా ఉంది" },
  ],
};
