import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { Ciphertext, DiaryContent } from "../schema/diary";

/**
 * Diary encryption at rest: AES-256-GCM with a per-parent key derived by HKDF-SHA256 from
 * DIARY_ENCRYPTION_KEY (32 random bytes, base64). Each entry gets a fresh 96-bit IV, and the
 * entry id and parent id are bound in as associated data, so ciphertext can't be moved
 * between entries or parents. Server-only: never import this from client code.
 */

const ALGO = "aes-256-gcm";

export class DiaryKeyMissing extends Error {
  constructor() {
    super("DIARY_ENCRYPTION_KEY is not set. Diary entries can't be stored without it.");
    this.name = "DiaryKeyMissing";
  }
}

export function masterKeyFromEnv(env: Record<string, string | undefined> = process.env): Buffer {
  const raw = env.DIARY_ENCRYPTION_KEY;
  if (!raw) throw new DiaryKeyMissing();
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("DIARY_ENCRYPTION_KEY must be 32 bytes, base64 encoded.");
  return key;
}

function parentKey(master: Buffer, parentId: string): Buffer {
  return Buffer.from(hkdfSync("sha256", master, Buffer.from("roundtrip-diary-v1"), `parent:${parentId}`, 32));
}

function aad(entryId: string, parentId: string, part: string): Buffer {
  return Buffer.from(`${part}|${entryId}|${parentId}`);
}

export function encryptBytes(
  master: Buffer,
  parentId: string,
  entryId: string,
  plain: Buffer,
  part = "content",
): Ciphertext {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, parentKey(master, parentId), iv);
  cipher.setAAD(aad(entryId, parentId, part));
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ct: ct.toString("base64"),
  };
}

export function decryptBytes(
  master: Buffer,
  parentId: string,
  entryId: string,
  envelope: Ciphertext,
  part = "content",
): Buffer {
  const decipher = createDecipheriv(ALGO, parentKey(master, parentId), Buffer.from(envelope.iv, "base64"));
  decipher.setAAD(aad(entryId, parentId, part));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(envelope.ct, "base64")), decipher.final()]);
}

export function encryptContent(master: Buffer, parentId: string, entryId: string, content: DiaryContent): Ciphertext {
  return encryptBytes(master, parentId, entryId, Buffer.from(JSON.stringify(content), "utf8"));
}

export function decryptContent(master: Buffer, parentId: string, entryId: string, envelope: Ciphertext): DiaryContent {
  return JSON.parse(decryptBytes(master, parentId, entryId, envelope).toString("utf8")) as DiaryContent;
}
