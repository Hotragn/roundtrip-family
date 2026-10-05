import { z } from "zod";
import { IsoDateTime, Provenance } from "./common";

/** AES-256-GCM ciphertext envelope. See packages/core/src/crypto/diary.ts. */
export const Ciphertext = z.object({
  v: z.literal(1),
  iv: z.string(),
  tag: z.string(),
  ct: z.string(),
});
export type Ciphertext = z.infer<typeof Ciphertext>;

/** What is inside the ciphertext. Only the parent's own app ever sees this decrypted. */
export const DiaryContent = z.object({
  text: z.string().optional(),
  transcript: z.string().optional(),
  photo: z.string().optional(),
  feelingWords: z.array(z.string()).default([]),
  audioMime: z.string().optional(),
});
export type DiaryContent = z.infer<typeof DiaryContent>;

/**
 * Stored diary entry. Only routing metadata stays in the clear: who wrote it, when,
 * whether it is shared, and whether it is in the memory book.
 */
export const DiaryEntry = z.object({
  _id: z.string(),
  householdId: z.string(),
  parentId: z.string(),
  provenance: Provenance,
  kind: z.enum(["voice", "text", "photo"]),
  createdAt: IsoDateTime,
  content: Ciphertext,
  /** Encrypted original audio, base64 inside the envelope. */
  audio: Ciphertext.optional(),
  outingId: z.string().optional(),
  /** Private by default. Only the parent changes this. */
  shared: z.boolean().default(false),
  inMemoryBook: z.boolean().default(false),
  /** Demo visitors' entries live in a session and expire. */
  sessionId: z.string().optional(),
  expiresAt: z.date().optional(),
});
export type DiaryEntry = z.infer<typeof DiaryEntry>;
