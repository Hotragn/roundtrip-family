import { type DataClass, route } from "./outbound";

export class PrivacyViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivacyViolation";
  }
}

/**
 * Throws unless the route may carry this class of data. Call it at every outbound call site.
 * Personal data never goes to a hosted service, whatever the route says.
 */
export function assertOutbound(routeId: string, dataClass: DataClass, url?: string): void {
  const r = route(routeId);
  if (!r.accepts.includes(dataClass)) {
    throw new PrivacyViolation(`Route ${routeId} may not carry ${dataClass} data.`);
  }
  if (url) {
    const host = new URL(url).hostname;
    const ok = r.hosts.some((h) => host === h || host.endsWith(`.${h}`));
    if (!ok) throw new PrivacyViolation(`Route ${routeId} does not list host ${host}.`);
  }
}

/** fetch with the privacy guard in front. */
export async function outboundFetch(
  routeId: string,
  dataClass: DataClass,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  assertOutbound(routeId, dataClass, url);
  return fetch(url, init);
}

const PHONE = /(\+?\d[\d\s().-]{6,}\d)/g;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

/**
 * Removes names, phone numbers and email addresses from text before it leaves for a
 * hosted service such as ElevenLabs. Names are matched as whole words, case-insensitively.
 */
export function scrubPersonal(text: string, names: string[]): string {
  let out = text.replace(EMAIL, "").replace(PHONE, "");
  for (const name of names) {
    if (!name.trim()) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(^|[^\\p{L}])${escaped}(?=$|[^\\p{L}])`, "giu"), "$1");
  }
  return out
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}
