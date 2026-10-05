import type { Parent } from "@roundtrip/core";
import type { Candidate } from "./candidates";

/**
 * Help joining: a short card in the local language to show someone at the door, the Telugu
 * meaning for the parent, and who to ask. Written from fixed templates so the words strangers
 * read are always correct; nothing here comes from a model.
 */

const LANG_NAMES: Record<string, Record<string, string>> = {
  en: { te: "Telugu", hi: "Hindi", en: "English" },
  de: { te: "Telugu", hi: "Hindi", en: "Englisch" },
};

export interface JoinCard {
  kind: "volunteer" | "join" | "visit";
  local: string;
  meaning: string;
  askWho: string;
}

export function joinCard(c: Candidate, p: Parent, localLanguage: string): JoinCard {
  const names = LANG_NAMES[localLanguage] ?? LANG_NAMES.en!;
  const spoken = [p.language, ...p.otherLanguages.filter((l) => l.level === "speaks").map((l) => l.code)]
    .map((code) => names[code])
    .filter(Boolean);
  const langs =
    spoken.length > 1
      ? `${spoken.slice(0, -1).join(", ")} ${localLanguage === "de" ? "und" : "and"} ${spoken.at(-1)}`
      : spoken[0];
  const volunteer = c.category === "temple";
  const group = c.category === "senior_center" || c.category === "library" || c.kind === "event";
  if (localLanguage === "de") {
    if (volunteer)
      return {
        kind: "volunteer",
        local: `Ich möchte gern ehrenamtlich helfen. Ich spreche ${langs}.`,
        meaning: "నేను స్వచ్ఛందంగా సేవ చేయాలనుకుంటున్నాను. నాకు ఈ భాషలు వచ్చు.",
        askWho: "Fragen Sie im Büro des Tempels.",
      };
    return {
      kind: group ? "join" : "visit",
      local: `Ich möchte gern mitmachen. Ich spreche ${langs}. Wer kann mir helfen?`,
      meaning: "నేను ఇందులో చేరాలనుకుంటున్నాను. నాకు ఎవరు సహాయం చేస్తారు?",
      askWho: "Fragen Sie am Empfang.",
    };
  }
  if (volunteer)
    return {
      kind: "volunteer",
      local: `I would like to volunteer. I speak ${langs}.`,
      meaning: "నేను స్వచ్ఛందంగా సేవ చేయాలనుకుంటున్నాను. నాకు ఈ భాషలు వచ్చు.",
      askWho: "Ask at the temple office.",
    };
  return {
    kind: group ? "join" : "visit",
    local: `I would like to join. I speak ${langs}. Who can help me sign up?`,
    meaning: "నేను ఇందులో చేరాలనుకుంటున్నాను. పేరు నమోదుకు ఎవరు సహాయం చేస్తారు?",
    askWho: c.category === "library" ? "Ask at the front desk." : "Ask the staff at the front desk.",
  };
}
