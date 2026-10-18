import "server-only";
import { agentMail, type Mailer, safetyAlertEmail } from "@roundtrip/agent/email";
import { isHousehold, loadBoard } from "../plan-board";
import { hhmm, onClock, tripLine } from "../plan-format";
import { type PushMessage, pushToSession } from "./push";
import type { SafetyTimer } from "./safety-timers";

/**
 * What a fired hosted safety timer does: a notification to the browsers that turned alerts on
 * (lib/server/push.ts), and the existing safety alert email through AgentMail, which sends only
 * to DEMO_ALERT_EMAIL and only with AGENTMAIL_API_KEY set. The dashboard shows the alert on its
 * own (app/(site)/plan/api/alerts). Both carry first names and the outing's details only.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const and = (who: string[]) =>
  who.length > 1 ? `${who.slice(0, -1).join(", ")} and ${who.at(-1)}` : (who[0] ?? "They");

export function alertPush(t: SafetyTimer, timeZone: string): PushMessage {
  const back = onClock(t.expectedBack.toISOString(), timeZone).time;
  return {
    title: `${and(t.who)} ${t.who.length > 1 ? "aren't" : "isn't"} home yet`,
    body: `From ${t.title}, expected back by ${back}. Call to check on them.`,
    url: `/plan/${t.household}/their-week`,
  };
}

export async function deliverAlert(
  t: SafetyTimer,
  deps: { mailer?: Pick<Mailer, "send">; push?: typeof pushToSession } = {},
): Promise<{ pushed: number; email: "sent" | "not_sent" }> {
  if (!isHousehold(t.household)) return { pushed: 0, email: "not_sent" };
  const board = loadBoard(t.household);
  const tz = board.household.timezone;
  const pushed = await (deps.push ?? pushToSession)(t.sessionId, alertPush(t, tz)).catch(() => 0);

  const item =
    board.items.find((i) => i.id === t.itemId) ??
    Object.values(board.alternatives)
      .flat()
      .find((i) => i.id === t.itemId);
  if (!item) return { pushed, email: "not_sent" };
  const back = onClock(t.expectedBack.toISOString(), tz);
  const date = new Date(`${back.date}T12:00:00Z`);
  const roles = t.parentIds.map((id) => board.parents.find((p) => p.id === id)?.role);
  const site = process.env.RENDER_EXTERNAL_URL?.replace(/\/+$/, "");
  const email = safetyAlertEmail({
    who: t.who,
    pronoun: roles.length === 1 ? (roles[0] === "father" ? "he" : "she") : "they",
    place: t.title,
    dayLabel: `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`,
    leave: hhmm(Math.max(0, back.minutes - (item.back - item.depart))),
    back: back.time,
    travel: tripLine(item) || "the planned way",
    nudgedAt: onClock((t.nudgedAt ?? t.nudgeAt).toISOString(), tz).time,
    emergency: [board.household.emergency, board.household.secondaryEmergency].filter((x): x is NonNullable<typeof x> =>
      Boolean(x),
    ),
    dashboardUrl: site ? `${site}/plan/${t.household}` : null,
    // Both hosted households are the fictional demo ones.
    synthetic: true,
  });
  const r = await (deps.mailer ?? agentMail())
    .send({
      kind: "alert",
      subject: email.subject,
      text: email.text,
      html: email.html,
      labels: ["roundtrip", "safety-alert"],
      dataClass: "synthetic",
    })
    .catch(() => ({ sent: false as const }));
  return { pushed, email: r.sent ? "sent" : "not_sent" };
}
