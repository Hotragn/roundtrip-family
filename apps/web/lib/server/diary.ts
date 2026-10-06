import "server-only";
import { randomBytes } from "node:crypto";
import type { Ciphertext } from "@roundtrip/core";
import {
  DiaryKeyMissing,
  decryptBytes,
  decryptContent,
  encryptBytes,
  encryptContent,
  masterKeyFromEnv,
} from "@roundtrip/core/crypto";
import { listRecords, removeRecord, saveRecord } from "./session";

/**
 * The diary on the server: each entry is encrypted with its parent's own key (AES-256-GCM,
 * packages/core/src/crypto/diary.ts) before it's stored, with only who, when and whether it's
 * shared in the clear. Only shared entries are ever decrypted for the dashboard; private ones
 * never leave this module. In the demo, entries live in the visitor's session for a day.
 */

let devKey: Buffer | null = null;

/** The server's diary key. Development and tests use a per-process key when none is configured. */
export function diaryKey(): Buffer {
  try {
    return masterKeyFromEnv();
  } catch (e) {
    if (!(e instanceof DiaryKeyMissing) || process.env.NODE_ENV === "production") throw e;
    devKey ??= randomBytes(32);
    return devKey;
  }
}

export interface DiaryInput {
  household: string;
  parentId: string;
  entryId: string;
  kind: "voice" | "text" | "photo";
  createdAt: string;
  text?: string;
  feelingWords: string[];
  outingId?: string;
  shared: boolean;
  inMemoryBook: boolean;
  /** Base64 of the recording, when there is one. */
  audio?: string;
  audioMime?: string;
}

/** What is stored: routing metadata in the clear, everything they said or wrote encrypted. */
interface Stored {
  household: string;
  parentId: string;
  entryId: string;
  kind: DiaryInput["kind"];
  createdAt: string;
  outingId?: string;
  shared: boolean;
  inMemoryBook: boolean;
  deleted?: boolean;
  content?: Ciphertext;
  audio?: Ciphertext;
  audioMime?: string;
}

export interface SharedEntry {
  entryId: string;
  parentId: string;
  kind: DiaryInput["kind"];
  createdAt: string;
  text: string;
  feelingWords: string[];
  outingId?: string;
  inMemoryBook: boolean;
  hasAudio: boolean;
}

const recordId = (household: string, entryId: string) => `${household}:${entryId}`;

/** The demo keeps a visit's diary small: the free database is shared by every visitor. */
export const VISIT_LIMITS = { entries: 60, audioBytes: 12_000_000 };

export class VisitLimitReached extends Error {
  constructor() {
    super("This demo visit has reached its diary limit.");
    this.name = "VisitLimitReached";
  }
}

export async function saveEntry(e: DiaryInput): Promise<void> {
  const mine = (await listRecords("diary")).map((r) => r.payload as unknown as Stored);
  const others = mine.filter((s) => !(s.household === e.household && s.entryId === e.entryId));
  const audioBytes = others.reduce((n, s) => n + (s.audio ? s.audio.ct.length * 0.75 : 0), 0);
  if (others.length >= VISIT_LIMITS.entries || audioBytes + (e.audio?.length ?? 0) * 0.75 > VISIT_LIMITS.audioBytes) {
    throw new VisitLimitReached();
  }
  const key = diaryKey();
  const stored: Stored = {
    household: e.household,
    parentId: e.parentId,
    entryId: e.entryId,
    kind: e.kind,
    createdAt: e.createdAt,
    outingId: e.outingId,
    shared: e.shared,
    inMemoryBook: e.inMemoryBook,
    content: encryptContent(key, e.parentId, e.entryId, { text: e.text, feelingWords: e.feelingWords }),
    audio: e.audio ? encryptBytes(key, e.parentId, e.entryId, Buffer.from(e.audio, "base64"), "audio") : undefined,
    audioMime: e.audio ? e.audioMime : undefined,
  };
  await saveRecord("diary", recordId(e.household, e.entryId), stored as unknown as Record<string, unknown>);
}

/** Deleting leaves a marker, so an entry seeded into the demo stays deleted for this visitor. */
export async function deleteEntry(household: string, parentId: string, entryId: string): Promise<void> {
  await removeRecord("diary", recordId(household, entryId));
  const marker: Stored = {
    household,
    parentId,
    entryId,
    kind: "text",
    createdAt: new Date().toISOString(),
    shared: false,
    inMemoryBook: false,
    deleted: true,
  };
  await saveRecord("diary", recordId(household, entryId), marker as unknown as Record<string, unknown>);
}

async function stored(household: string): Promise<Stored[]> {
  return (await listRecords("diary"))
    .map((r) => r.payload as unknown as Stored)
    .filter((s) => s.household === household);
}

/** Entry ids this visitor saved or deleted, so seeded copies of them aren't shown twice. */
export async function touchedIds(household: string): Promise<Set<string>> {
  return new Set((await stored(household)).map((s) => s.entryId));
}

/** The entries their parents chose to share, decrypted. Private entries are skipped unread. */
export async function sharedEntries(household: string): Promise<SharedEntry[]> {
  const key = diaryKey();
  const out: SharedEntry[] = [];
  for (const s of await stored(household)) {
    if (s.deleted || !s.shared || !s.content) continue;
    try {
      const c = decryptContent(key, s.parentId, s.entryId, s.content);
      out.push({
        entryId: s.entryId,
        parentId: s.parentId,
        kind: s.kind,
        createdAt: s.createdAt,
        text: c.text ?? "",
        feelingWords: c.feelingWords ?? [],
        outingId: s.outingId,
        inMemoryBook: s.inMemoryBook,
        hasAudio: Boolean(s.audio),
      });
    } catch {
      // Written under another key (a server restart in development): it stays on the phone.
    }
  }
  return out;
}

/** A shared entry's recording, decrypted for playback on the dashboard. Null for anything private. */
export async function sharedAudio(household: string, entryId: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const s = (await stored(household)).find((x) => x.entryId === entryId);
  if (!s || s.deleted || !s.shared || !s.audio) return null;
  try {
    return {
      bytes: decryptBytes(diaryKey(), s.parentId, s.entryId, s.audio, "audio"),
      mime: s.audioMime ?? "audio/webm",
    };
  } catch {
    return null;
  }
}
