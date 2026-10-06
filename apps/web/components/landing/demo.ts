import "server-only";
import { DEMO_WEEKS } from "@/lib/demo-weeks";
import type { OutingView } from "@/lib/week";
import { cardFor, fmtTime } from "@/lib/week";
import te from "@/messages/te.json";

/**
 * What the landing page shows from the demo week (synthetic: a fictional family, with places,
 * events and routes from live searches). Read at build time, so the page always shows the
 * week the demo actually has.
 */
const DAYS: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const week = DEMO_WEEKS["fremont-demo"];
const PARENT = "p_sarala";

/** The short trip summary at the end of a reason, like "By bus, about 17 minutes each way". */
function tripSummary(o: OutingView): string {
  const sentence = o.reasonText.split(/(?<=\.)\s+/).find((s) => /^(By bus|By train|A \d+-minute walk)/.test(s));
  return (sentence ?? "").replace(/,\s*back by [\d:]+\.?$/, "").replace(/\.$/, "");
}

export function demoWeek() {
  const parent = week.parents.find((p) => p.id === PARENT);
  const outings = week.outings
    .filter((o) => o.parentIds.includes(PARENT))
    .sort((a, b) => a.date.localeCompare(b.date) || a.slot.depart - b.slot.depart);
  const plan = outings.map((o) => ({
    id: o.id,
    when: `${DAYS[o.slot.day] ?? o.slot.day} ${fmtTime(o.slot.depart)}`,
    place: o.venue,
    trip: tripSummary(o),
    approved: o.status === "approved",
    chips: o.chips
      .slice(0, 2)
      .map((c) => ({ label: c.label, tone: c.direction === "for" ? "for" : "against" }) as const),
  }));
  // The ticket: her first approved outing with a bus ride.
  const trip = outings.find((o) => o.status === "approved" && o.route?.legs.some((l) => l.mode === "bus"));
  const card = trip ? cardFor(trip, PARENT) : undefined;
  const bus = trip?.route?.legs.find((l) => l.mode === "bus");
  const ticket =
    trip && card && trip.route
      ? {
          title: card.title,
          leave: fmtTime(trip.slot.depart),
          back: fmtTime(trip.slot.back),
          legs: trip.route.legs.map((l) => ({ mode: l.mode, minutes: l.durationMinutes, stops: l.numStops })),
          linesLabel: trip.route.legs
            .map((l) =>
              l.mode === "bus"
                ? `bus ${l.line?.name ?? ""} for ${l.durationMinutes} minutes, ${l.numStops ?? 0} stops`
                : `${l.mode} ${l.durationMinutes} minutes`,
            )
            .join(", "),
          bus: bus?.line?.name ?? "",
          stops: bus?.numStops ?? 0,
          driverLead: card.driver.lead,
          driverStop: card.driver.stopName,
          backMinutes: trip.slot.back,
        }
      : null;
  const safety = week.household.safety;
  return {
    name: parent?.firstName ?? "Sarala",
    plan,
    ticket,
    safety: ticket
      ? {
          due: ticket.back,
          check: fmtTime(ticket.backMinutes + safety.bufferMinutes),
          email: fmtTime(ticket.backMinutes + safety.bufferMinutes + safety.nudgeWaitMinutes),
          buffer: safety.bufferMinutes,
          wait: safety.nudgeWaitMinutes,
        }
      : null,
    feelings: week.feelingWords
      .flatMap((f) => f.words.slice(0, 1))
      .map((w) => w.replace(/\s*\(.*\)\s*$/, ""))
      .slice(0, 3),
    te: {
      leave: te.Parents.leave,
      back: te.Parents.back,
      stops: te.Parents.stops,
      imHome: te.Parents.imHome,
      diary: te.Diary.title,
      private: te.Diary.private,
    },
  };
}

export type DemoWeek = ReturnType<typeof demoWeek>;
