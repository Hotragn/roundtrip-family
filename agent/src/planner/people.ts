import { languageNameIn, type Parent, type Person } from "@roundtrip/core";

/**
 * How the planner hears about someone the parents know: the relation, the language and the
 * words they share, never a name. The dashboard shows the family this exact sentence.
 */
export function anonymizedPerson(p: Person, parents: Parent[]): string {
  const who = parents
    .filter((x) => p.knownParentIds.includes(x._id))
    .map((x) => (x.addressAs.includes("నాన్న") ? "father" : "mother"))
    .join(" and ");
  // Spoken Chinese in the persona is Mandarin; Intl's display name would say "Chinese".
  const language = p.language === "zh" ? "Mandarin" : languageNameIn(p.language, "en");
  return `A ${p.relation.toLowerCase()} who speaks ${language}; knows the ${who}; shared words: ${p.sharedWords.join(", ")}.`;
}
