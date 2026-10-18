import "server-only";
import { COUNTRIES } from "@roundtrip/core";
import { DEMO_WEEKS } from "@/lib/demo-weeks";
import type { WeekView } from "@/lib/week";
import type { FamilyHousehold } from "./accounts";

/**
 * A real family's phone week before anything is planned: their own names, stop, contact and
 * emergency number, with no outings yet. The help card's local-language lines come from the
 * demo household in the same country (English for the US, German for Germany), with their
 * name and stop filled in on the phone.
 */
export function familyWeek(h: FamilyHousehold): WeekView {
  const s = h.setup;
  const country = COUNTRIES[s.hostCountry]!;
  const like =
    Object.values(DEMO_WEEKS).find((w) => w.household.hostCountry === s.hostCountry) ?? DEMO_WEEKS["fremont-demo"]!;
  const sameLanguage = Object.values(DEMO_WEEKS).find((w) => w.parents[0]?.language === s.parents[0]?.language);
  const today = new Date().toISOString().slice(0, 10);
  return {
    provenance: "synthetic",
    note: "Your family's own household. No outings are planned yet.",
    household: {
      id: h._id,
      slug: h._id,
      hostCountry: s.hostCountry,
      localLanguage: s.localLanguage,
      // ponytail: the country's demo time zone; ask in setup when a family lives in another one.
      timezone: like.household.timezone,
      metroArea: s.searchLocation,
      homeArea: s.homeStop,
      helpCardText: like.household.helpCardText,
      localPhrases: like.household.localPhrases,
      contact: { role: "adult_child", label: s.contactLabel, phone: s.contactPhone, fictional: false },
      emergency: country.emergency,
      secondaryEmergency: country.secondaryEmergency ?? null,
      safety: like.household.safety,
    },
    parents: s.parents.map((p, i) => ({
      id: h.parents[i]!.id,
      firstName: p.firstName,
      addressAs: p.addressAs,
      // ponytail: setup doesn't ask; the first parent shows as mother. Add a field when a family needs otherwise.
      role: i === 0 ? "mother" : "father",
      language: p.language,
      readingSupport: p.readingSupport,
    })),
    people: [],
    feelingWords: sameLanguage?.feelingWords ?? [],
    week: { key: "unplanned", monday: today, label: "Not planned yet" },
    planNote: "",
    outings: [],
  };
}
