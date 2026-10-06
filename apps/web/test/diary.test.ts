import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The diary store, with the session swapped for a map we can inspect. Everything stored is
// checked for the words the parent said; nothing may reach the network.
const stored = new Map<string, Record<string, unknown>>();
vi.mock("server-only", () => ({}));
vi.mock("../lib/server/session", () => ({
  saveRecord: async (kind: string, id: string, payload: Record<string, unknown>) => {
    stored.set(`${kind}:${id}`, payload);
    return { payload };
  },
  listRecords: async (kind: string) =>
    [...stored.entries()].filter(([k]) => k.startsWith(`${kind}:`)).map(([, payload]) => ({ payload })),
  removeRecord: async (kind: string, id: string) => {
    stored.delete(`${kind}:${id}`);
  },
}));

const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
  throw new Error("The diary must not call the network");
});

const { deleteEntry, saveEntry, sharedAudio, sharedEntries, VISIT_LIMITS, VisitLimitReached } = await import(
  "../lib/server/diary"
);

const SECRET = "ఈరోజు ఇంట్లోనే ఉన్నాను. పద్మ అక్కకి ఫోన్ చేశాను.";
const base = {
  household: "fremont-demo",
  parentId: "p_sarala",
  entryId: "d_test_01",
  kind: "voice" as const,
  createdAt: "2026-10-05T10:00:00-07:00",
  text: SECRET,
  feelingWords: ["ఊరు గుర్తొచ్చింది"],
  shared: false,
  inMemoryBook: false,
  audio: Buffer.from("fake recording bytes").toString("base64"),
  audioMime: "audio/webm",
};

describe("diary at rest", () => {
  beforeEach(() => stored.clear());
  afterAll(() => fetchSpy.mockRestore());

  it("stores the words and the recording encrypted, never in the clear", async () => {
    await saveEntry(base);
    const raw = JSON.stringify([...stored.values()]);
    expect(raw).not.toContain("పద్మ");
    expect(raw).not.toContain("ఊరు గుర్తొచ్చింది");
    expect(raw).not.toContain(base.audio);
    expect(raw).toContain('"shared":false');
  });

  it("never returns a private entry, and returns a shared one decrypted", async () => {
    await saveEntry(base);
    expect(await sharedEntries("fremont-demo")).toEqual([]);
    expect(await sharedAudio("fremont-demo", "d_test_01")).toBeNull();
    await saveEntry({ ...base, shared: true });
    const [e] = await sharedEntries("fremont-demo");
    expect(e?.text).toBe(SECRET);
    expect(e?.feelingWords).toEqual(["ఊరు గుర్తొచ్చింది"]);
    expect((await sharedAudio("fremont-demo", "d_test_01"))?.bytes.toString()).toBe("fake recording bytes");
  });

  it("keeps another household's and a deleted entry out", async () => {
    await saveEntry({ ...base, shared: true });
    expect(await sharedEntries("munich-demo")).toEqual([]);
    await deleteEntry("fremont-demo", "p_sarala", "d_test_01");
    expect(await sharedEntries("fremont-demo")).toEqual([]);
  });

  it("binds each entry to its parent and id", async () => {
    await saveEntry({ ...base, shared: true });
    const rec = [...stored.values()][0] as { parentId: string };
    // Moving the ciphertext to another parent makes it unreadable, so it's skipped.
    rec.parentId = "p_venkat";
    expect(await sharedEntries("fremont-demo")).toEqual([]);
  });

  it("keeps one visit's diary within the demo's limits", async () => {
    for (let i = 0; i < VISIT_LIMITS.entries; i++) {
      await saveEntry({ ...base, entryId: `d_limit_${i}`, audio: undefined });
    }
    await expect(saveEntry({ ...base, entryId: "d_limit_extra", audio: undefined })).rejects.toBeInstanceOf(
      VisitLimitReached,
    );
    // Changing an entry that's already stored is still fine.
    await expect(saveEntry({ ...base, entryId: "d_limit_0", audio: undefined, shared: true })).resolves.toBeUndefined();
  });

  it("made no network calls", () => {
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
