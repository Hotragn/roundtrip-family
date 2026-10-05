import type { EmergencyNumber } from "./schema/household";

/**
 * What follows a household's host country: emergency numbers, units, formats and
 * search settings. Emergency numbers come from official pages, never from memory;
 * each entry cites the page it was checked against.
 */
export interface CountryInfo {
  code: string;
  name: string;
  localLanguage: string;
  emergency: EmergencyNumber;
  /** A second number worth showing, e.g. police in Germany. */
  secondaryEmergency?: EmergencyNumber;
  temperatureUnit: "F" | "C";
  distanceUnit: "mi" | "km";
  currency: string;
  /** Locale for dates and numbers in the local language. */
  locale: string;
  serpapi: { gl: string; hl: string; googleDomain: string };
  /** A reserved fictional number range for demo contacts. */
  fictionalNumberNote: string;
}

export const COUNTRIES: Record<string, CountryInfo> = {
  US: {
    code: "US",
    name: "United States",
    localLanguage: "en",
    emergency: {
      number: "911",
      covers: "Police, fire and ambulance",
      // 911.gov, NHTSA's National 911 Program: "If you're experiencing an emergency, call 911 immediately."
      source: "https://www.911.gov/",
      verifiedOn: "2026-10-05",
    },
    temperatureUnit: "F",
    distanceUnit: "mi",
    currency: "USD",
    locale: "en-US",
    serpapi: { gl: "us", hl: "en", googleDomain: "google.com" },
    fictionalNumberNote: "555-0100 to 555-0199 are reserved for fictional use by NANPA.",
  },
  DE: {
    code: "DE",
    name: "Germany",
    localLanguage: "de",
    emergency: {
      number: "112",
      covers: "Fire and ambulance (Feuerwehr und Rettungsdienst)",
      // BBK, Federal Office of Civil Protection: "In Deutschland und in ganz Europa erreichen Sie
      // die Feuerwehr und den Rettungsdienst kostenfrei über die Rufnummer 112."
      source:
        "https://www.bbk.bund.de/DE/Warnung-Vorsorge/Vorsorge/Gesundheit-und-Hygiene/Erste-Hilfe-und-Notruf/erste-hilfe-und-notruf_node.html",
      verifiedOn: "2026-10-05",
    },
    secondaryEmergency: {
      number: "110",
      covers: "Police (Polizei)",
      // Same BBK page lists 110 and 112 as the numbers that reach the police, fire and rescue control centers.
      source:
        "https://www.bbk.bund.de/DE/Warnung-Vorsorge/Vorsorge/Gesundheit-und-Hygiene/Erste-Hilfe-und-Notruf/erste-hilfe-und-notruf_node.html",
      verifiedOn: "2026-10-05",
    },
    temperatureUnit: "C",
    distanceUnit: "km",
    currency: "EUR",
    locale: "de-DE",
    serpapi: { gl: "de", hl: "de", googleDomain: "google.de" },
    fictionalNumberNote:
      "Bundesnetzagentur reserves (0)89 99998 000 to 999 for media productions (Mitteilung 148/2021).",
  },
};

export function countryInfo(code: string): CountryInfo {
  const info = COUNTRIES[code];
  if (!info)
    throw new Error(`No country data for ${code}. Add it to packages/core/src/countries.ts with an official source.`);
  return info;
}

export function formatTemperature(celsius: number, country: string): string {
  const info = countryInfo(country);
  if (info.temperatureUnit === "F") return `${Math.round((celsius * 9) / 5 + 32)}°F`;
  return `${Math.round(celsius)}°C`;
}
