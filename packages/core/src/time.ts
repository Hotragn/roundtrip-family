/**
 * Week and clock helpers. The demo households are planned for a fixed week, so the
 * demo clock pins "now" to that week when the household is synthetic.
 */

/** The week the saved demo plans were made for: Monday 5 October 2026. */
export const DEMO_WEEK_START = "2026-10-05";
/** "Now" for the demo: Wednesday 7 October 2026, 08:40 local time, a day the parents are alone. */
export const DEMO_NOW_LOCAL = "2026-10-07T08:40:00";

/** ISO 8601 week, e.g. "2026-W41", for a calendar date given as YYYY-MM-DD. */
export function isoWeek(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Minutes since midnight for "HH:MM". */
export function clockMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

/** True when [start, end) in minutes overlaps a window list. */
export function overlapsWindow(
  startMin: number,
  endMin: number,
  windows: Array<{ start: string; end: string }>,
): boolean {
  return windows.some((w) => startMin < clockMinutes(w.end) && endMin > clockMinutes(w.start));
}

/** True when [start, end) sits entirely inside one window. */
export function insideWindow(
  startMin: number,
  endMin: number,
  windows: Array<{ start: string; end: string }>,
): boolean {
  return windows.some((w) => startMin >= clockMinutes(w.start) && endMin <= clockMinutes(w.end));
}
