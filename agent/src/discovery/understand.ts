import { EventCategory, EventUnderstanding } from "@roundtrip/core";
import type { DataClass } from "@roundtrip/core/privacy";
import type { z } from "zod";
import { type Gemma, gemma } from "../gemma";

/**
 * Event understanding: Gemma turns a raw listing into structured fields (language match, suits
 * older adults, indoor, cost, category, start and end). The prompt is fixed so responses cache.
 */

export const UNDERSTAND_VERSION = "v2";

export const SYSTEM = `You read one local event listing for a family planning outings for Telugu-speaking parents in their 60s, and return only JSON.

Fields:
- languageMatch: 2 if the event is in Telugu or run by a Telugu group (Telugu association, Telugu film, Bathukamma, Telugu Sankranti). 1 if it is Indian or South Asian but not Telugu (Hindi, Tamil, Punjabi, Bengali, Gujarati, Bollywood, Durga Puja, Diwali, Navratri, Garba, Hindu temple events in general). 0 otherwise.
- suitsOlderAdults: false only when the event is clearly unsuitable for people in their 60s: late night (starting 9 pm or later), nightclubs or bars, alcohol-centered, strenuous sport, adults-only nightlife, or children-only. Otherwise true. All-ages, family, community and senior events are true.
- indoor: true for halls, libraries, temples, centers, theaters, stores and rooms; false for parks, plazas, markets in the open, walks and fairs outdoors; null only if nothing says where it is.
- cost: {"free": true or false, "amount": the lowest adult price as a number or null, "currency": three-letter code}. "Free", "free entry" and "no charge" mean free true and amount 0.
- category: one of ${EventCategory.options.join(", ")}.
- start and end: ISO 8601 with the timezone offset given below, or null if the listing gives no time. Use the week given below to place weekday names and dates. If only a start time is given, end is null.`;

const Out = EventUnderstanding.extend({ category: EventCategory });

export interface UnderstandContext {
  /** e.g. "Monday 2026-10-05 to Sunday 2026-10-11" */
  week: string;
  /** e.g. "-07:00" for Pacific daylight time */
  offset: string;
  currency: string;
}

export async function understandListing(
  listing: string,
  ctx: UnderstandContext,
  opts: { g?: Gemma; dataClass?: DataClass } = {},
): Promise<z.infer<typeof Out>> {
  const g = opts.g ?? gemma();
  const res = await g.chatJson({
    purpose: `understand:${UNDERSTAND_VERSION}`,
    dataClass: opts.dataClass ?? "public",
    schema: Out,
    schemaName: "event_understanding",
    maxTokens: 300,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Week: ${ctx.week}. Timezone offset: ${ctx.offset}. Local currency: ${ctx.currency}.\n\nListing:\n${listing}`,
      },
    ],
  });
  return res.data;
}

/** The listing text Gemma sees, built from a search result. */
export function listingText(e: {
  title: string;
  when?: string;
  venueName?: string;
  address?: string;
  description?: string;
  ticketSources?: string[];
}): string {
  return [
    e.title,
    e.when ? `When: ${e.when}` : "",
    e.venueName ? `Where: ${e.venueName}` : "",
    e.address ? `Address: ${e.address}` : "",
    e.description ? `About: ${e.description}` : "",
    e.ticketSources?.length ? `Tickets: ${e.ticketSources.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
