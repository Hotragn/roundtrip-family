import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { decryptBytes, decryptContent } from "@roundtrip/core/crypto";
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { cookies, headers } from "next/headers";
import type { SetupForm } from "@/lib/setup-schema";
import { diaryKey } from "./diary";
import { householdOwner, ownedRecords, removeOwned } from "./session";
import { type Doc, find, get, put, remove } from "./store";

/**
 * Real families: the adult child signs in with a passkey (no passwords, no email), owns one
 * household, and each parent's phone opens through an unguessable link instead of signing in.
 * Passkeys use SimpleWebAuthn, following https://simplewebauthn.dev/docs/packages/server
 * (registration and authentication) and https://simplewebauthn.dev/docs/packages/browser.
 * Nothing here calls an outside service: WebAuthn runs between the browser and this server.
 */

export const ACCOUNT_COOKIE = "rt_account";
const CHALLENGE_COOKIE = "rt_challenge";
const SESSION_DAYS = 30;
const CHALLENGE_MS = 5 * 60_000;
const RP_NAME = "Roundtrip";

const token = () => randomBytes(32).toString("base64url");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

/** The site the passkey belongs to. WEBAUTHN_ORIGIN pins it; otherwise the request's own host. */
async function relyingParty(): Promise<{ origin: string; rpID: string }> {
  const pinned = process.env.WEBAUTHN_ORIGIN;
  if (pinned) return { origin: pinned, rpID: new URL(pinned).hostname };
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost").split(",")[0]!.trim();
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0]!.trim();
  return { origin: `${proto}://${host}`, rpID: host.replace(/:\d+$/, "") };
}

const cookieBase = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };

async function newChallenge(challenge: string, userId?: string): Promise<void> {
  const id = token();
  await put("authChallenges", { _id: hash(id), challenge, userId, expiresAt: new Date(Date.now() + CHALLENGE_MS) });
  (await cookies()).set(CHALLENGE_COOKIE, id, { ...cookieBase, maxAge: CHALLENGE_MS / 1000 });
}

/** Each challenge answers once, within five minutes. */
async function takeChallenge(): Promise<{ challenge: string; userId?: string } | null> {
  const jar = await cookies();
  const id = jar.get(CHALLENGE_COOKIE)?.value;
  jar.delete(CHALLENGE_COOKIE);
  if (!id) return null;
  const c = await get(`authChallenges`, hash(id));
  await remove("authChallenges", { _id: hash(id) });
  if (!c || (c.expiresAt as Date) < new Date()) return null;
  return { challenge: c.challenge as string, userId: c.userId as string | undefined };
}

async function startSession(accountId: string): Promise<void> {
  const t = token();
  const now = Date.now();
  await put("authSessions", {
    _id: hash(t),
    accountId,
    createdAt: new Date(now),
    expiresAt: new Date(now + SESSION_DAYS * 86_400_000),
  });
  (await cookies()).set(ACCOUNT_COOKIE, t, { ...cookieBase, maxAge: SESSION_DAYS * 86_400 });
}

// Sign-up: a new account and its first passkey, kept on the device (a discoverable credential),
// so signing in later needs no name or email.
export async function registrationOptions() {
  const { rpID } = await relyingParty();
  const userId = token();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: new TextEncoder().encode(userId),
    userName: "Roundtrip family",
    attestationType: "none",
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  await newChallenge(options.challenge, userId);
  return options;
}

export async function verifyRegistration(response: RegistrationResponseJSON): Promise<boolean> {
  const c = await takeChallenge();
  if (!c?.userId) return false;
  const { origin, rpID } = await relyingParty();
  const v = await verifyRegistrationResponse({
    response,
    expectedChallenge: c.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  }).catch(() => null);
  if (!v?.verified) return false;
  const { credential } = v.registrationInfo;
  await put("accounts", { _id: c.userId, createdAt: new Date() });
  await put("credentials", {
    _id: credential.id,
    accountId: c.userId,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports ?? [],
    createdAt: new Date(),
  });
  await startSession(c.userId);
  return true;
}

export async function authenticationOptions() {
  const { rpID } = await relyingParty();
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
  await newChallenge(options.challenge);
  return options;
}

export async function verifyAuthentication(response: AuthenticationResponseJSON): Promise<boolean> {
  const c = await takeChallenge();
  if (!c) return false;
  const cred = await get("credentials", response.id);
  if (!cred) return false;
  const { origin, rpID } = await relyingParty();
  const v = await verifyAuthenticationResponse({
    response,
    expectedChallenge: c.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: cred._id,
      publicKey: new Uint8Array(Buffer.from(cred.publicKey as string, "base64url")),
      counter: cred.counter as number,
      transports: cred.transports as AuthenticatorTransportFuture[],
    },
  }).catch(() => null);
  if (!v?.verified) return false;
  await put("credentials", { ...cred, counter: v.authenticationInfo.newCounter, usedAt: new Date() });
  await startSession(cred.accountId as string);
  return true;
}

/** The signed-in account, or null. Expired sessions count as signed out. */
export async function currentAccount(): Promise<string | null> {
  const t = (await cookies()).get(ACCOUNT_COOKIE)?.value;
  if (!t) return null;
  const s = await get("authSessions", hash(t));
  if (!s || (s.expiresAt as Date) < new Date()) return null;
  return s.accountId as string;
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const t = jar.get(ACCOUNT_COOKIE)?.value;
  if (t) await remove("authSessions", { _id: hash(t) });
  jar.delete(ACCOUNT_COOKIE);
}

// Households.

export interface FamilyParent {
  id: string;
  firstName: string;
  /** The phone link's secret: /parents/k/<token>. */
  token: string;
}
export interface FamilyHousehold extends Doc {
  accountId: string;
  setup: SetupForm;
  parents: FamilyParent[];
  createdAt: Date;
  updatedAt: Date;
}

export const isFamilySlug = (s: string) => /^fam-[a-f0-9]{12}$/.test(s);

export async function householdOf(accountId: string): Promise<FamilyHousehold | null> {
  return (await find<FamilyHousehold>("familyHouseholds", { accountId }))[0] ?? null;
}

/** The household, only for the account that owns it. Anyone else gets null (a 404). */
export async function ownedHousehold(accountId: string | null, slug: string): Promise<FamilyHousehold | null> {
  if (!accountId || !isFamilySlug(slug)) return null;
  const h = await get<FamilyHousehold>("familyHouseholds", slug);
  return h && h.accountId === accountId ? h : null;
}

/**
 * Creates the account's household, or updates its setup. Each parent keeps their phone link
 * across edits; a parent added later gets a new one, and a removed parent's link stops working.
 */
export async function saveHousehold(accountId: string, setup: SetupForm): Promise<FamilyHousehold> {
  const existing = await householdOf(accountId);
  const slug = existing?._id ?? `fam-${randomBytes(6).toString("hex")}`;
  const parents: FamilyParent[] = setup.parents.map((p, i) => ({
    id: `p_${i + 1}`,
    firstName: p.firstName,
    token: existing?.parents[i]?.token ?? token(),
  }));
  const now = new Date();
  const h: FamilyHousehold = {
    _id: slug,
    accountId,
    setup,
    parents,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await put("familyHouseholds", h);
  await remove("phoneLinks", { household: slug });
  for (const p of parents) await put("phoneLinks", { _id: hash(p.token), household: slug, parentId: p.id });
  return h;
}

/** Whose phone a link opens, or null for an unknown or revoked link. */
export async function phoneLink(t: string): Promise<{ household: string; parentId: string } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(t)) return null;
  const l = await get("phoneLinks", hash(t));
  return l ? { household: l.household as string, parentId: l.parentId as string } : null;
}

/** Everything held for the household, with diary entries decrypted for their owners. */
export async function exportHousehold(h: FamilyHousehold) {
  const records = await ownedRecords(householdOwner(h._id));
  const of = (kind: string) => records.filter((r) => r.kind === kind).map((r) => r.payload);
  const key = diaryKey();
  const diary = of("diary").map((s) => {
    const { content, audio, ...meta } = s as Record<string, unknown> & {
      parentId: string;
      entryId: string;
      content?: Parameters<typeof decryptContent>[3];
      audio?: Parameters<typeof decryptBytes>[3];
    };
    try {
      return {
        ...meta,
        ...(content ? decryptContent(key, meta.parentId, meta.entryId, content) : {}),
        audioBase64: audio ? decryptBytes(key, meta.parentId, meta.entryId, audio, "audio").toString("base64") : null,
      };
    } catch {
      return { ...meta, unreadable: "Written under a different server key" };
    }
  });
  const credentials = await find("credentials", { accountId: h.accountId });
  return {
    exportedAt: new Date().toISOString(),
    note: "Everything Roundtrip holds for your household. Plans and the people memory are empty until the planner runs for you.",
    account: {
      createdAt: (await get("accounts", h.accountId))?.createdAt ?? null,
      passkeys: credentials.map((c) => ({ createdAt: c.createdAt, lastUsed: c.usedAt ?? null })),
    },
    household: {
      id: h._id,
      setup: h.setup,
      parents: h.parents.map(({ id, firstName }) => ({ id, firstName })),
      createdAt: h.createdAt,
      updatedAt: h.updatedAt,
    },
    plans: of("plan"),
    approvals: of("approval"),
    checkins: of("checkin"),
    howWasIt: of("reply"),
    diary,
    peopleMemory: of("people"),
  };
}

/** Removes the household and the account behind it: every record, in every collection. */
export async function deleteHousehold(h: FamilyHousehold): Promise<void> {
  await removeOwned(householdOwner(h._id));
  await remove("phoneLinks", { household: h._id });
  await remove("familyHouseholds", { _id: h._id });
  await remove("credentials", { accountId: h.accountId });
  await remove("authSessions", { accountId: h.accountId });
  await remove("accounts", { _id: h.accountId });
  (await cookies()).delete(ACCOUNT_COOKIE);
}
