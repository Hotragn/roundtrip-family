import { z } from "zod";
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

const SCHEMAS = { checkin: Checkin, reply: Reply } as const;

export async function POST(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const schema = SCHEMAS[kind as keyof typeof SCHEMAS];
  if (!schema) return Response.json({ error: "Unknown kind" }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  await saveRecord(kind, parsed.data.id, parsed.data);
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
  if (!(kind in SCHEMAS)) return Response.json({ error: "Unknown kind" }, { status: 404 });
  return Response.json({ records: (await listRecords(kind)).map((r) => r.payload) });
}
