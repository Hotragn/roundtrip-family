import { DAY_LONG, describePeriods, fitVisit, type Weekday } from "@roundtrip/core/hours";
import { format } from "date-fns";
import type { LegSummary } from "@/components/travel/travel-line";
import type { BoardItem, PlanBoard } from "./plan-types";

export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

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
  const minutes = item.legs.length ? item.legs.reduce((s, l) => s + l.minutes, 0) : item.travelMinutes;
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
