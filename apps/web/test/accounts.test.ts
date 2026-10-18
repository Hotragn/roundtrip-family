import { beforeEach, describe, expect, it, vi } from "vitest";

// Real families' accounts and households, with the in-memory store (no MONGODB_URI). The
// browser's cookie jar is a map we swap per "person"; the passkey checks themselves are stubbed
// here and run for real in e2e/accounts.spec.ts with a virtual authenticator.
vi.mock("server-only", () => ({}));
let jar = new Map<string, { value: string; opts?: Record<string, unknown> }>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k)!.value } : undefined),
    set: (k: string, value: string, opts?: Record<string, unknown>) => jar.set(k, { value, opts }),
    delete: (k: string) => jar.delete(k),
  }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));
vi.mock("@simplewebauthn/server", async (orig) => ({
  ...(await orig<typeof import("@simplewebauthn/server")>()),
  verifyRegistrationResponse: async () => ({
    verified: true,
    registrationInfo: { credential: { id: `cred-${Math.random()}`, publicKey: new Uint8Array([1, 2]), counter: 0 } },
  }),
}));
vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
  throw new Error("Accounts must not call the network");
});

const accounts = await import("../lib/server/accounts");
const { saveRecord, ownedRecords, householdOwner, PHONE_COOKIE } = await import("../lib/server/session");
const { saveEntry } = await import("../lib/server/diary");
const { find } = await import("../lib/server/store");
const exportRoute = await import("../app/api/household/[slug]/route");

const SETUP = {
  hostCountry: "US",
  localLanguage: "en",
  searchLocation: "Fremont, California",
  homeStop: "Mowry Ave & Fremont Blvd",
  parents: [
    {
      firstName: "Lakshmi",
      addressAs: "Amma",
      language: "te",
      readingSupport: "audio_first" as const,
      maxWalkMinutes: 15,
      transitComfort: "with_company" as const,
      bestStart: "09:00",
      bestEnd: "12:00",
      napStart: "",
      napEnd: "",
    },
  ],
  alone: [],
  trialRunDays: [],
  contactLabel: "Your child",
  contactPhone: "+1 510 555 0142",
  phonePlan: "wifi_only" as const,
};

async function signUp(): Promise<string> {
  jar = new Map();
  await accounts.registrationOptions();
  expect(await accounts.verifyRegistration({} as never)).toBe(true);
  return (await accounts.currentAccount())!;
}
const as = (cookies: typeof jar) => {
  jar = cookies;
};
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("passkey accounts", () => {
  beforeEach(() => {
    jar = new Map();
  });

  it("signs up with a challenge that answers once, and sets a locked-down session cookie", async () => {
    await accounts.registrationOptions();
    const challenge = jar.get("rt_challenge")!;
    expect(await accounts.verifyRegistration({} as never)).toBe(true);
    const cookie = jar.get(accounts.ACCOUNT_COOKIE)!;
    expect(cookie.opts).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax" });
    expect(await accounts.currentAccount()).toBeTruthy();
    // Replaying the same challenge fails.
    jar.set("rt_challenge", challenge);
    expect(await accounts.verifyRegistration({} as never)).toBe(false);
  });

  it("refuses an unknown passkey and a missing challenge", async () => {
    expect(await accounts.verifyAuthentication({ id: "nope" } as never)).toBe(false);
    await accounts.authenticationOptions();
    expect(await accounts.verifyAuthentication({ id: "nope" } as never)).toBe(false);
  });

  it("signs out, and the old cookie no longer works", async () => {
    await signUp();
    const saved = new Map(jar);
    await accounts.signOut();
    expect(await accounts.currentAccount()).toBeNull();
    as(saved);
    expect(await accounts.currentAccount()).toBeNull();
  });

  it("stores no password, email or name for the account", async () => {
    const id = await signUp();
    const raw = JSON.stringify([
      ...(await find("accounts", { _id: id })),
      ...(await find("credentials", { accountId: id })),
    ]);
    expect(raw).not.toMatch(/password|email|@/i);
  });
});

describe("a real household", () => {
  it("only its own account can read or delete it; another account and a visitor get 404", async () => {
    const owner = await signUp();
    const ownerJar = new Map(jar);
    const h = await accounts.saveHousehold(owner, SETUP);
    expect(accounts.isFamilySlug(h._id)).toBe(true);

    expect((await exportRoute.GET(new Request("http://x"), ctx(h._id))).status).toBe(200);

    await signUp(); // a second account
    expect(await accounts.ownedHousehold(await accounts.currentAccount(), h._id)).toBeNull();
    expect((await exportRoute.GET(new Request("http://x"), ctx(h._id))).status).toBe(404);
    const del = new Request("http://x", { method: "DELETE", body: JSON.stringify({ confirm: "delete" }) });
    expect((await exportRoute.DELETE(del, ctx(h._id))).status).toBe(404);

    as(new Map()); // a visitor
    expect((await exportRoute.GET(new Request("http://x"), ctx(h._id))).status).toBe(404);

    as(ownerJar);
    expect(await accounts.ownedHousehold(owner, h._id)).not.toBeNull();
  });

  it("gives each parent an unguessable phone link that keeps across edits", async () => {
    const owner = await signUp();
    const h = await accounts.saveHousehold(owner, SETUP);
    const token = h.parents[0]!.token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await accounts.phoneLink(token)).toEqual({ household: h._id, parentId: "p_1" });
    expect(await accounts.phoneLink("x".repeat(43))).toBeNull();
    const again = await accounts.saveHousehold(owner, { ...SETUP, homeStop: "Fremont BART" });
    expect(again._id).toBe(h._id);
    expect(again.parents[0]!.token).toBe(token);
  });

  it("exports everything with the diary decrypted, then deletes every record", async () => {
    const owner = await signUp();
    const ownerJar = new Map(jar);
    const h = await accounts.saveHousehold(owner, SETUP);

    // The parent's phone, carrying its link.
    as(new Map([[PHONE_COOKIE, { value: h.parents[0]!.token }]]));
    await saveRecord("checkin", "c1", { id: "c1", parentId: "p_1", state: "home" });
    await saveEntry({
      household: h._id,
      parentId: "p_1",
      entryId: "d_secret",
      kind: "text",
      createdAt: "2026-10-18T10:00:00Z",
      text: "Went to the temple today",
      feelingWords: [],
      shared: false,
      inMemoryBook: false,
    });
    const records = await ownedRecords(householdOwner(h._id));
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.expiresAt === undefined)).toBe(true);
    expect(JSON.stringify(records)).not.toContain("temple");

    as(ownerJar);
    const res = await exportRoute.GET(new Request("http://x"), ctx(h._id));
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const data = await res.json();
    expect(data.household.setup.homeStop).toBe(SETUP.homeStop);
    expect(data.checkins).toHaveLength(1);
    expect(data.diary[0].text).toBe("Went to the temple today");
    expect(JSON.stringify(data)).not.toContain(h.parents[0]!.token);

    const refused = new Request("http://x", { method: "DELETE", body: JSON.stringify({}) });
    expect((await exportRoute.DELETE(refused, ctx(h._id))).status).toBe(400);
    const del = new Request("http://x", { method: "DELETE", body: JSON.stringify({ confirm: "delete" }) });
    expect((await exportRoute.DELETE(del, ctx(h._id))).status).toBe(200);

    expect(await ownedRecords(householdOwner(h._id))).toHaveLength(0);
    expect(await find("familyHouseholds", { _id: h._id })).toHaveLength(0);
    expect(await find("phoneLinks", { household: h._id })).toHaveLength(0);
    expect(await find("accounts", { _id: owner })).toHaveLength(0);
    expect(await find("credentials", { accountId: owner })).toHaveLength(0);
    expect(await find("authSessions", { accountId: owner })).toHaveLength(0);
    expect(await accounts.phoneLink(h.parents[0]!.token)).toBeNull();
    expect(await accounts.currentAccount()).toBeNull();
  });
});
