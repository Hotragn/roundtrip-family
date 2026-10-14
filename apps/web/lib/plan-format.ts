import { DAY_LONG, describePeriods, fitVisit, type Weekday } from "@roundtrip/core/hours";
import { format } from "date-fns";
import type { LegSummary } from "@/components/travel/travel-line";
import type { BoardItem, PlanBoard } from "./plan-types";

export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** The demo's fixed week, said as what it is: "Sample week, 5 to 11 October 2026". */
export const sampleWeek = (label: string) => `Sample week, ${label}`;

/** A listing's departure ("8:33 AM" or "09:50") in the dashboard's 24-hour style ("08:33"). */
export function clock24(s: string): string {
  const t = /^(\d{1,2}):(\d{2})\s*([ap])\.?m\.?$/i.exec(s.trim());
  if (!t) return s;
  const h = (Number(t[1]) % 12) + (t[3]!.toLowerCase() === "p" ? 12 : 0);
  return hhmm(h * 60 + Number(t[2]));
}

/** A moment on the household's clock: its date ("2026-10-05"), time ("08:30") and minutes since midnight. */
export function onClock(iso: string, timezone: string): { date: string; time: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: hhmm(minutes), minutes };
}

/**
 * "Sarala was home at 10:05" when the check-in falls on the outing's day after it left. A visitor's
 * tap on a demo phone uses the real clock, not the sample week's, so it's said as what it was.
 */
export function checkinLine(
  name: string,
  iso: string,
  timezone: string,
  outing: { date: string; depart: number },
): string {
  const at = onClock(iso, timezone);
  if (at.date === outing.date && at.minutes >= outing.depart) return `${name} was home at ${at.time}`;
  return `You tapped “I’m home” on ${name}’s demo phone on ${shortDate(at.date)} at ${at.time}`;
}

export const DAY_NAMES: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export const shortDate = (iso: string) => format(new Date(`${iso}T12:00:00`), "EEE d MMM");
export const longDate = (iso: string) => format(new Date(`${iso}T12:00:00`), "EEEE d MMMM");

export function whoFor(item: Pick<BoardItem, "parentIds">, board: PlanBoard): string {
  const names = board.parents.filter((p) => item.parentIds.includes(p.id)).map((p) => p.firstName);
  return names.length === 2 ? `${names[0]} and ${names[1]}` : (names[0] ?? "");
}

/** For a narrow card: one name, or "Both". */
export function whoShort(item: Pick<BoardItem, "parentIds">, board: PlanBoard): string {
  const names = board.parents.filter((p) => item.parentIds.includes(p.id)).map((p) => p.firstName);
  return names.length === 2 ? "Both" : (names[0] ?? "");
}

/** The legs as travel lines: the real route when the ticket exists, else the planner's estimate. */
export function legSummaries(item: BoardItem): LegSummary[] {
  if (item.legs.length > 0) {
    return item.legs.map((l) => ({
      mode: l.mode === "rail" ? "rail" : l.mode === "walk" ? "walk" : "bus",
      minutes: l.minutes,
      stops: l.stops,
    }));
  }
  if (item.withAdultChild) return [{ mode: "car", minutes: item.travelMinutes ?? 20 }];
  if (item.travelMinutes === null) return [];
  return [{ mode: item.travelMinutes <= 16 ? "walk" : "bus", minutes: item.travelMinutes }];
}

/** "Bus 211 · 20 min" or "Walk · 14 min" */
export function tripLine(item: BoardItem): string {
  const transit = item.legs.filter((l) => l.mode !== "walk");
  // The route's door-to-door total (it counts the wait at the stop), so the card matches the
  // ticket and the reason text. The legs' sum is only a fallback.
  const minutes = item.travelMinutes ?? (item.legs.length ? item.legs.reduce((s, l) => s + l.minutes, 0) : null);
  if (item.withAdultChild) return "With you, by car";
  if (transit.length) {
    const lines = transit
      .map((l) => (l.mode === "rail" ? (l.line?.name ?? "Train") : `Bus ${l.line?.name ?? ""}`.trim()))
      .join(" + ");
    return `${lines} · ${minutes} min`;
  }
  if (minutes === null) return "";
  return item.legs.length || minutes <= 16 ? `Walk · ${minutes} min` : `About ${minutes} min by bus`;
}

/** "Open 08:30 to 10:00 on Mondays", "Open all day", or null when the listing gives no hours. */
export function hoursLine(item: Pick<BoardItem, "hours">, day: string): string | null {
  const text = describePeriods(item.hours?.[day as Weekday]);
  if (!text) return null;
  const days = `${DAY_LONG[day as Weekday]}s`;
  if (text === "closed") return `Closed on ${days}`;
  if (text === "open all day") return "Open all day";
  return `Open ${text} on ${days}`;
}

/** Whether they're free that day and the place is open when they'd get there; null when the move works. */
export function moveProblem(
  board: Pick<PlanBoard, "household">,
  item: Pick<BoardItem, "title" | "hours" | "depart" | "back" | "travelMinutes">,
  day: string,
): { title: string; description: string } | null {
  const weekend = day === "sat" || day === "sun";
  if (!weekend && !board.household.aloneDays.includes(day)) {
    const days = board.household.aloneDays.map((d) => DAY_NAMES[d]).join(", ");
    return {
      title: `They aren't on their own on ${DAY_NAMES[day]}`,
      description: `Pick a day they're free: ${days}, or the weekend with you.`,
    };
  }
  const travel = item.travelMinutes ?? 0;
  const stay = Math.max(0, item.back - item.depart - 2 * travel);
  const fit = fitVisit(item.hours, day as Weekday, item.depart + travel, stay, Math.min(stay, 30));
  if (fit.ok) return null;
  const when = `on ${DAY_NAMES[day]}s`;
  const why = fit.why.startsWith("closed on")
    ? `${item.title} is ${fit.why}.`
    : fit.why.startsWith("opens")
      ? `${item.title} ${fit.why} ${when}, after they'd arrive.`
      : fit.why.startsWith("closes")
        ? `${item.title} ${fit.why} ${when}, too soon after they'd arrive.`
        : `${item.title} is ${fit.why} ${when}.`;
  return { title: `Not ${DAY_NAMES[day]}`, description: `${why} ${hoursLine(item, day) ?? ""}`.trim() };
}

export function dayAvailability(board: PlanBoard, day: string): string {
  const alone = board.household.aloneTimes.find((t) => t.day === day);
  if (alone) return `On their own ${alone.start} to ${alone.end}`;
  if (day === "sat" || day === "sun") return "Weekend: you can go together";
  return "Family at home";
}

/**
 * The adult child's answer for the week's weekPlan workflow, from the dashboard's changes:
 * the approved outings (by the outing chosen in a swap's place), every swap and every day move,
 * so a moved outing's reminder and safety timer follow it to its new day.
 */
export function weekAnswer(
  items: Array<{ id: string }>,
  overlay: { status: Record<string, string>; swaps: Record<string, string>; moves?: Record<string, string> },
): { approve: string[]; swapTo: Record<string, string>; moveTo: Record<string, string> } {
  return {
    approve: items.filter((i) => overlay.status[i.id] === "approved").map((i) => overlay.swaps[i.id] ?? i.id),
    swapTo: { ...overlay.swaps },
    moveTo: { ...overlay.moves },
  };
}
