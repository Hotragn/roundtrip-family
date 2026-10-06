import { isHousehold } from "@/lib/plan-board";
import { sharedAudio } from "@/lib/server/diary";

/** A shared diary recording, decrypted for playback. Anything private answers 404. */
export async function GET(_req: Request, { params }: { params: Promise<{ household: string; entry: string }> }) {
  const { household, entry } = await params;
  if (!isHousehold(household) || !/^d_[a-z0-9_]{1,40}$/.test(entry)) return new Response(null, { status: 404 });
  const audio = await sharedAudio(household, entry);
  if (!audio) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(audio.bytes), {
    headers: { "Content-Type": audio.mime, "Cache-Control": "private, no-store" },
  });
}
