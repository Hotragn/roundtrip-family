import { numberList } from "./reply";

/**
 * Email copy for the adult child: the planning email, the safety alert, the "home" note after
 * an alert, the weekly summary, and the short replies for approve by reply. Each email has
 * plain text and simple HTML in the style of docs/brand.md: the logo as text, one marigold
 * button, and nothing that needs an image to make sense. Emails carry first names and outing
 * details only: never an address, a phone number, diary text or a recording.
 */

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** One outing as the email shows it. */
export interface EmailOuting {
  /** The number to reply with. */
  n: number;
  /** "Monday 12 October" */
  dayLabel: string;
  /** "08:30" */
  leave: string;
  /** "10:10" */
  back: string;
  /** The place's name only, never its street address. */
  place: string;
  /** First names. */
  who: string[];
  /** "By Bus 211, about 20 minutes each way" */
  travel: string;
  /** One line on why they'd like it. */
  reason: string;
  withAdultChild: boolean;
  firstRideTogether: boolean;
  /** In an updated planning email: what happened to it so far. */
  state?: "approved" | "skipped" | "new" | "pending";
}

export interface PlanningEmail {
  /** "Sarala and Venkat" */
  names: string;
  /** "12 to 18 October 2026" */
  weekLabel: string;
  /** The planner's honest note, e.g. "No Telugu events or groups were found nearby this week." */
  note: string;
  outings: EmailOuting[];
  /** "Monday 12 October, 07:30" */
  replyBy: string;
  dashboardUrl: string | null;
  /** The footer line a reply can be traced by (ids.planReference). */
  reference: string;
  synthetic: boolean;
  /** Set for the follow-up after a swap: the outings still waiting for an answer. */
  update?: { waiting: number[]; noOtherOption: number[] };
}

export interface SafetyAlertEmail {
  who: string[];
  /** "she", "he" or "they" */
  pronoun: "she" | "he" | "they";
  place: string;
  dayLabel: string;
  leave: string;
  /** Expected home, "10:10". */
  back: string;
  travel: string;
  /** When the phone showed its reminder, "10:55". */
  nudgedAt: string;
  /** The household's emergency numbers from an official source, e.g. 911, or 112 and then 110. */
  emergency: Array<{ number: string; covers: string }>;
  dashboardUrl: string | null;
  synthetic: boolean;
}

export interface HomeNoticeEmail {
  who: string[];
  place: string;
  /** "12:05" */
  homeAt: string;
  synthetic: boolean;
}

export type Face = "good" | "okay" | "not_good";

export interface SummaryItem {
  dayLabel: string;
  place: string;
  who: string[];
  outcome: "home" | "home_after_nudge" | "home_after_alert" | "alerted" | "with_you" | "no_check_in";
  /** "10:05", when a check-in arrived. */
  homeAt?: string;
  faces: Array<{ who: string; face: Face }>;
}

export interface WeeklySummaryEmail {
  names: string;
  weekLabel: string;
  items: SummaryItem[];
  dashboardUrl: string | null;
  synthetic: boolean;
}

const INK = "#1F2A44";
const MUTED = "#4A5573";
const BUS = "#F2A900";
const PAPER = "#FBFCFE";
const LINE = "#E3E7F0";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** "Sarala", "Sarala and Venkat", "Sarala, Venkat and Kamala". */
export function names(who: string[]): string {
  if (who.length <= 1) return who.join("");
  return `${who.slice(0, -1).join(", ")} and ${who.at(-1)}`;
}

const SYNTHETIC_LINE = "This is a fictional demo household (synthetic). The places come from live searches.";

interface Block {
  /** Plain text lines; an empty string is a blank line. */
  text: string[];
  /** The same content as HTML. */
  html: string;
}

const p = (s: string, style = "") => `<p style="margin:0 0 12px;${style}">${escapeHtml(s)}</p>`;
const small = (s: string) => p(s, `color:${MUTED};font-size:13px`);

function page(blocks: Block[], button: { label: string; url: string } | null, footer: string[]): RenderedEmail["html"] {
  const body = blocks.map((b) => b.html).join("\n");
  const cta = button
    ? `<p style="margin:20px 0"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:${BUS};color:${INK};font-weight:600;padding:12px 20px;border-radius:12px;text-decoration:none">${escapeHtml(button.label)}</a></p>`
    : "";
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>',
    `<body style="margin:0;background:${PAPER};color:${INK};font-family:Hind,'Segoe UI',Arial,sans-serif;font-size:16px;line-height:1.55">`,
    '<div style="max-width:560px;margin:0 auto;padding:24px 20px">',
    `<p style="margin:0 0 20px;font-size:20px;font-weight:600;letter-spacing:-0.01em">Roundtrip</p>`,
    body,
    cta,
    footer.length
      ? `<div style="margin-top:24px;padding-top:12px;border-top:1px solid ${LINE}">${footer.map(small).join("")}</div>`
      : "",
    "</div></body></html>",
  ].join("\n");
}

function text(blocks: Block[], button: { label: string; url: string } | null, footer: string[]): string {
  const lines = blocks.flatMap((b) => [...b.text, ""]);
  if (button) lines.push(`${button.label}: ${button.url}`, "");
  lines.push(...footer);
  return `${lines.join("\n").trim()}\n`;
}

function render(subject: string, blocks: Block[], button: { label: string; url: string } | null, footer: string[]) {
  return { subject, text: text(blocks, button, footer), html: page(blocks, button, footer) };
}

const para = (s: string): Block => ({ text: [s], html: p(s) });

function outingBlock(o: EmailOuting, showState: boolean): Block {
  const head = `${o.n}. ${o.dayLabel}, ${o.leave} to ${o.back}: ${names(o.who)}`;
  const state =
    showState && o.state === "approved"
      ? "Approved."
      : showState && o.state === "skipped"
        ? "Skipped."
        : showState && o.state === "new"
          ? "New option."
          : "";
  const firstRide = o.firstRideTogether
    ? o.who.length > 1
      ? "New route: ride it with them at the weekend first."
      : "New route: ride it together at the weekend first."
    : "";
  const lines = [o.place, o.travel, o.reason, firstRide, state].filter(Boolean);
  return {
    text: [head, ...lines.map((l) => `   ${l}`)],
    html: `<div style="margin:0 0 16px;padding:12px 14px;border:1px solid ${LINE};border-radius:12px;background:#fff">
<p style="margin:0 0 4px;font-weight:600">${escapeHtml(head)}</p>
${lines.map((l, i) => `<p style="margin:0;${i === 0 ? "font-weight:600" : `color:${i === lines.length - 1 && state ? INK : MUTED}`}">${escapeHtml(l)}</p>`).join("\n")}
</div>`,
  };
}

const HOW_TO_REPLY: Block = {
  text: [
    "To answer, reply to this email with one of these:",
    "   yes, or approve all",
    "   approve 1 and 3",
    "   skip 2",
    "   swap 2, for another option",
  ],
  html: `${p("To answer, reply to this email with one of these:")}
<ul style="margin:0 0 12px;padding-left:20px">${["yes, or approve all", "approve 1 and 3", "skip 2", "swap 2, for another option"].map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`,
};

export function planningEmail(e: PlanningEmail): RenderedEmail {
  const waiting = e.update?.waiting ?? e.outings.map((o) => o.n);
  const subject = e.update
    ? `Updated outings for ${e.names}: reply to approve`
    : `Outings for ${e.names}, ${e.weekLabel}: reply to approve`;
  const intro = e.update
    ? `Here is the week with your change. ${waiting.length === 1 ? `Outing ${waiting[0]} is` : `Outings ${numberList(waiting)} are`} waiting for your answer.`
    : `Here are the outings planned for ${e.names}, ${e.weekLabel}.${e.note ? ` ${e.note}` : ""}`;
  const blocks: Block[] = [para(intro)];
  if (e.update?.noOtherOption.length) {
    const ns = e.update.noOtherOption;
    blocks.push(
      para(
        `There's no other option for ${ns.length === 1 ? `outing ${ns[0]}` : `outings ${numberList(ns)}`} this week, so it stays as it was. Reply "skip ${ns[0]}" to leave it out.`,
      ),
    );
  }
  blocks.push(...e.outings.map((o) => outingBlock(o, Boolean(e.update))));
  blocks.push(HOW_TO_REPLY);
  blocks.push(para(`Reply by ${e.replyBy} so the tickets reach their phones in time.`));
  const footer = [...(e.synthetic ? [SYNTHETIC_LINE] : []), e.reference];
  return render(
    subject,
    blocks,
    e.dashboardUrl ? { label: "Open the week on the dashboard", url: e.dashboardUrl } : null,
    footer,
  );
}

const HAS: Record<SafetyAlertEmail["pronoun"], string> = { she: "She", he: "He", they: "They" };

export function safetyAlertEmail(e: SafetyAlertEmail): RenderedEmail {
  const who = names(e.who);
  const plural = e.who.length > 1;
  const subject = `${who} ${plural ? "aren't" : "isn't"} home yet from ${e.place}`;
  const pronoun = HAS[e.pronoun];
  const object = e.pronoun === "she" ? "her" : e.pronoun === "he" ? "him" : "them";
  const possessive = e.pronoun === "she" ? "her" : e.pronoun === "he" ? "his" : "their";
  const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const [first, ...others] = e.emergency;
  const steps = [
    `Call ${object}, or someone ${e.pronoun} might be with.`,
    `If you can't reach ${object}, call ${e.place}, or go the way ${e.pronoun} went.`,
    ...(first
      ? [
          [
            `If you think ${e.pronoun} ${e.pronoun === "they" ? "need" : "needs"} help now, call ${first.number}, the number for ${lowerFirst(first.covers)}.`,
            ...others.map((x) => `For ${lowerFirst(x.covers)}, call ${x.number}.`),
          ].join(" "),
        ]
      : []),
  ];
  const blocks: Block[] = [
    para(`${who} ${plural ? "haven't" : "hasn't"} tapped "I'm home" yet.`),
    para(
      `${pronoun} went to ${e.place} on ${e.dayLabel}, leaving at ${e.leave} (${e.travel.charAt(0).toLowerCase()}${e.travel.slice(1)}), and ${plural || e.pronoun === "they" ? "were" : "was"} expected home by ${e.back}. ${possessive.charAt(0).toUpperCase()}${possessive.slice(1)} phone showed a reminder at ${e.nudgedAt}, and no check-in has arrived since.`,
    ),
    para(
      `${pronoun} may already be home: a check-in made without Wi-Fi waits on the phone and sends once it's back on home Wi-Fi.`,
    ),
    {
      text: ["What to do now:", ...steps.map((s, i) => `   ${i + 1}. ${s}`)],
      html: `${p("What to do now:")}
<ol style="margin:0 0 12px;padding-left:20px">${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>`,
    },
    para(`When ${e.pronoun} ${e.pronoun === "they" ? "tap" : "taps"} "I'm home", you'll get a short email.`),
  ];
  return render(
    subject,
    blocks,
    e.dashboardUrl ? { label: "Open their week", url: e.dashboardUrl } : null,
    e.synthetic ? [SYNTHETIC_LINE] : [],
  );
}

export function homeNoticeEmail(e: HomeNoticeEmail): RenderedEmail {
  const who = names(e.who);
  const plural = e.who.length > 1;
  return render(
    `${who} ${plural ? "are" : "is"} home`,
    [para(`${who} tapped "I'm home" at ${e.homeAt}, back from ${e.place}.`)],
    null,
    e.synthetic ? [SYNTHETIC_LINE] : [],
  );
}

const FACE_WORDS: Record<Face, string> = { good: "good", okay: "okay", not_good: "not good" };

function summaryLine(i: SummaryItem): string {
  const done =
    i.outcome === "with_you"
      ? "With you."
      : i.outcome === "no_check_in"
        ? "No check-in arrived."
        : i.outcome === "alerted"
          ? "No check-in arrived, and you were sent an alert."
          : i.outcome === "home_after_alert"
            ? `Home at ${i.homeAt}, after the alert.`
            : i.outcome === "home_after_nudge"
              ? `Home at ${i.homeAt}, after a reminder.`
              : `Home at ${i.homeAt}.`;
  const faces = i.faces.map((f) => `${f.who} picked "${FACE_WORDS[f.face]}".`).join(" ");
  return [done, faces].filter(Boolean).join(" ");
}

export function weeklySummaryEmail(e: WeeklySummaryEmail): RenderedEmail {
  const blocks: Block[] = [
    para(
      e.items.length
        ? `Here's what ${e.names} went to this week, ${e.weekLabel}.`
        : `No outings were set up for ${e.names} this week, ${e.weekLabel}.`,
    ),
    ...e.items.map((i) => {
      const head = `${i.dayLabel}: ${i.place}, ${names(i.who)}`;
      const line = summaryLine(i);
      return {
        text: [head, `   ${line}`],
        html: `<div style="margin:0 0 12px"><p style="margin:0;font-weight:600">${escapeHtml(head)}</p><p style="margin:0;color:${MUTED}">${escapeHtml(line)}</p></div>`,
      };
    }),
  ];
  if (e.items.some((i) => i.faces.length)) {
    blocks.push(para('The faces are what they picked for "How was it?". Voice replies stay on their phones.'));
  }
  return render(
    `${e.names}'s week, ${e.weekLabel}`,
    blocks,
    e.dashboardUrl ? { label: "Open their week", url: e.dashboardUrl } : null,
    e.synthetic ? [SYNTHETIC_LINE] : [],
  );
}

/** A reply in the planning email's thread. */
export type ThreadReply =
  | { kind: "ask_again"; why: string }
  | { kind: "confirmed"; approved: number[]; skipped: number[] }
  | { kind: "already_set"; approved: number[] }
  | { kind: "old_week" };

export function threadReplyEmail(r: ThreadReply, dashboardUrl: string | null): { text: string; html: string } {
  const dash = dashboardUrl ? ` Changes can also be made on the dashboard: ${dashboardUrl}` : "";
  const blocks: Block[] =
    r.kind === "ask_again"
      ? [para(r.why), HOW_TO_REPLY]
      : r.kind === "confirmed"
        ? [
            para(
              r.approved.length
                ? `Approved ${numberList(r.approved)}. The tickets are on their phones.`
                : "Nothing was approved, so no outings are set up this week.",
            ),
            ...(r.skipped.length ? [para(`Skipped ${numberList(r.skipped)}.`)] : []),
          ]
        : r.kind === "already_set"
          ? [
              para(
                r.approved.length
                  ? `This week is already set: ${numberList(r.approved)} ${r.approved.length === 1 ? "is" : "are"} on their phones.${dash}`
                  : `This week is already set, with no outings.${dash}`,
              ),
            ]
          : [para(`That reply was for an earlier week's plan. Reply to this week's planning email instead.${dash}`)];
  return { text: text(blocks, null, []), html: page(blocks, null, []) };
}
