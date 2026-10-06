import "server-only";

/**
 * Counting windows for things that spend free-tier allowances (Gemma neurons, TabPFN pools).
 * In memory: the demo runs one instance, and a restart starting the counts afresh is fine.
 */
const hits = new Map<string, number[]>();

function recent(key: string, windowMs: number, now: number): number[] {
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.set(key, list);
  return list;
}

/** Checks every limit first and counts against all of them only when each has room. */
export function take(
  limits: Array<{ key: string; max: number; windowMs: number }>,
): { ok: true } | { ok: false; retryInMinutes: number } {
  const now = Date.now();
  for (const l of limits) {
    const list = recent(l.key, l.windowMs, now);
    if (list.length >= l.max) {
      return { ok: false, retryInMinutes: Math.max(1, Math.ceil((l.windowMs - (now - list[0]!)) / 60_000)) };
    }
  }
  for (const l of limits) hits.get(l.key)!.push(now);
  return { ok: true };
}
