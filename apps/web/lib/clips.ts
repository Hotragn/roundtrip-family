import { type ClipManifest, clipUrl } from "@roundtrip/agent/voice";
import type { WeekView } from "./week";

/**
 * Attaches the speech pipeline's saved clips to a week. speech/ saves one for each card title and
 * body, practice phrase and help card, listed in data/demo/audio/manifest.json by language and
 * exact text, so a Listen button plays the open-model voice and the phone caches it for outings.
 * A text with no clip keeps no URL, and its Listen button uses the phone's own voice.
 */
export function withClips(week: WeekView, clips: ClipManifest): WeekView {
  const local = week.household.localLanguage;
  const languageOf = new Map(week.parents.map((p) => [p.id, p.language]));
  return {
    ...week,
    household: { ...week.household, helpCardAudio: clipUrl(clips, local, week.household.helpCardText) },
    outings: week.outings.map((o) => ({
      ...o,
      cards: o.cards.map((c) => {
        const lang = languageOf.get(c.parentId) ?? "te";
        return {
          ...c,
          audio: { title: clipUrl(clips, lang, c.title), body: clipUrl(clips, lang, c.body) },
          phrases: c.phrases.map((p) => ({ ...p, audio: { local: clipUrl(clips, local, p.local) } })),
        };
      }),
    })),
  };
}
