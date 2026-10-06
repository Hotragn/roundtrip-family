import { z } from "zod";
import { DEMO_WEEKS } from "@/lib/demo-weeks";
import { deleteEntry, saveEntry, VisitLimitReached } from "@/lib/server/diary";

/**
 * The phone's diary sync, when it's back on home Wi-Fi: the latest state of one entry (saved,
 * shared, unshared, in the memory book) or its deletion. The server encrypts the words and
 * the recording with that parent's key before storing them (lib/server/diary.ts) and nothing
 * here is sent anywhere else. In the demo the store is the visitor's session, for a day.
 */

const Save = z.object({
  action: z.literal("save"),
  household: z.string().max(60),
  entry: z.object({
    id: z.string().regex(/^d_[a-z0-9_]{1,40}$/),
    parentId: z.string().regex(/^p_[a-z0-9_]{1,40}$/),
    kind: z.enum(["voice", "text", "photo"]),
    createdAt: z.string().max(40),
    text: z.string().max(4000).optional(),
    feelingWords: z.array(z.string().max(40)).max(12).default([]),
    outingId: z.string().max(200).optional(),
    shared: z.boolean(),
    inMemoryBook: z.boolean().default(false),
    // About two minutes of speech; longer recordings stay on the phone.
    audio: z.string().max(3_000_000).optional(),
    audioMime: z.string().max(60).optional(),
  }),
});
const Delete = z.object({
  action: z.literal("delete"),
  household: z.string().max(60),
  parentId: z.string().regex(/^p_[a-z0-9_]{1,40}$/),
  entryId: z.string().regex(/^d_[a-z0-9_]{1,40}$/),
});
const Body = z.discriminatedUnion("action", [Save, Delete]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid entry" }, { status: 400 });
  const b = parsed.data;
  const week = DEMO_WEEKS[b.household];
  const parentId = b.action === "save" ? b.entry.parentId : b.parentId;
  if (!week?.parents.some((p) => p.id === parentId)) return Response.json({ error: "No such parent" }, { status: 404 });
  try {
    if (b.action === "delete") await deleteEntry(b.household, b.parentId, b.entryId);
    else
      await saveEntry({
        household: b.household,
        parentId: b.entry.parentId,
        entryId: b.entry.id,
        kind: b.entry.kind,
        createdAt: b.entry.createdAt,
        text: b.entry.text,
        feelingWords: b.entry.feelingWords,
        outingId: b.entry.outingId,
        shared: b.entry.shared,
        inMemoryBook: b.entry.inMemoryBook,
        audio: b.entry.audio,
        audioMime: b.entry.audioMime,
      });
  } catch (e) {
    // The phone keeps the entry either way; a refused sync leaves it in the outbox to try later.
    if (e instanceof VisitLimitReached) return Response.json({ error: e.message }, { status: 429 });
    // No key on this server: the entry stays on the phone and syncs once the key is set.
    return Response.json({ error: "Diary sync isn't set up on this server" }, { status: 503 });
  }
  return Response.json({ ok: true });
}
