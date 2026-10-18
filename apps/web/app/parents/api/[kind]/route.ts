import { z } from "zod";
import { findOuting, scheduleOuting, stopOuting } from "@/lib/server/safety-schedule";
import { testSeconds } from "@/lib/server/safety-timers";
import { listRecords, saveRecord } from "@/lib/server/session";
import { signalCheckin, signalHowWasIt } from "@/lib/server/temporal";

/**
 * The phone's outbox lands here when it's back online: check-ins ("I'm home") and "How was it?"
 * replies. Replies carry the face and whether a recording exists; the recording itself stays on
 * the phone in demo mode (in family mode it goes to the family's own server for transcription).
 * Diary entries have their own encrypted route.
 */

const Checkin = z.object({
  id: z.string().max(200),
  createdAt: z.string(),
  outingId: z.string().max(200),
  parentId: z.string().max(60),
  state: z.literal("home"),
});
const Reply = z.object({
  id: z.string().max(200),
  createdAt: z.string(),
  outingId: z.string().max(200),
  parentId: z.string().max(60),
  face: z.enum(["good", "okay", "not_good"]).nullable(),
  hasAudio: z.boolean(),
});

// The parent started the trip on their phone (the directions screen): where there's no Temporal,
// the hosted safety timer starts from now, for the trip's planned length.
const Leaving = z.object({
  id: z.string().max(200),
  createdAt: z.string(),
  outingId: z.string().max(200),
  parentId: z.string().max(60),
  testSeconds: z.number().optional(),
});

const SCHEMAS = { checkin: Checkin, reply: Reply, leaving: Leaving } as const;

export async function POST(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const schema = SCHEMAS[kind as keyof typeof SCHEMAS];
  if (!schema) return Response.json({ error: "Unknown kind" }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  if (kind === "leaving") {
    const l = parsed.data as z.infer<typeof Leaving>;
    const found = findOuting(l.outingId, l.parentId);
    if (!found) return Response.json({ error: "Not in this week's plan" }, { status: 404 });
    const on = await scheduleOuting(found.household, found.slotId, {
      fromNow: { outingId: l.outingId },
      testSeconds: testSeconds(l.testSeconds),
    });
    return Response.json({ ok: true, timer: on });
  }
  await saveRecord(kind, parsed.data.id, parsed.data);
  if (kind === "checkin") await stopOuting(parsed.data.outingId, "home");
  // With TEMPORAL_ADDRESS set, "I'm home" also stops the outing's safety timer. If the timer
  // can't be reached, the phone keeps the check-in and sends it again.
  if (kind === "checkin" && (await signalCheckin(parsed.data as z.infer<typeof Checkin>)) === "failed") {
    return Response.json({ ok: false, retry: true }, { status: 503 });
  }
  // The face goes to the week's summary; the reply itself is already saved, so a miss isn't retried.
  if (kind === "reply") await signalHowWasIt(parsed.data as z.infer<typeof Reply>).catch(() => "failed");
  return Response.json({ ok: true });
}

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!(kind in SCHEMAS) || kind === "leaving") return Response.json({ error: "Unknown kind" }, { status: 404 });
  return Response.json({ records: (await listRecords(kind)).map((r) => r.payload) });
}
