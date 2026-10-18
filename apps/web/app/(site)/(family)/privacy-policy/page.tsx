import type { Metadata } from "next";
import Link from "next/link";
import { NotLegalAdvice, Prose } from "@/components/account/prose";

export const metadata: Metadata = { title: "Privacy policy" };

/**
 * The privacy policy, matching what the code does: docs/privacy-table.md (generated from
 * packages/core/src/privacy/outbound.ts), lib/server/accounts.ts and lib/server/diary.ts.
 * Change this page in the same change as any of those.
 */
export default function PrivacyPolicy() {
  return (
    <Prose>
      <h1>Privacy policy</h1>
      <NotLegalAdvice />
      <p>Last updated 18 October 2026.</p>

      <h2>The demo</h2>
      <p>
        The two demo households, in Fremont and München, are fictional. If you try the demo without signing in, what you
        approve, check in or write is kept with a cookie for your visit and deleted after a day.
      </p>

      <h2>What we keep for a real family</h2>
      <ul>
        <li>
          Your sign-in: a passkey's public key and a random account number. Your fingerprint, face or screen lock never
          leaves your device. There is no password, and we never ask for an email address or your name.
        </li>
        <li>
          What you enter in setup: the country and town, the nearest bus stop (never an address), each parent's first
          name, how the app addresses them, their language, walking and bus comfort, good times of day, the days they're
          on their own, and one contact name and phone number.
        </li>
        <li>
          From your parents' phones: "I'm home" check-ins, "How was it?" answers, and diary entries they choose to sync.
          Diary words and recordings are encrypted before they're stored. The server holds the key, so it can show you
          the entries your parents share and include their entries in your download.
        </li>
      </ul>

      <h2>Where it's kept</h2>
      <p>
        In this site's database on MongoDB Atlas, and handled by the web server on Render. Those two companies host the
        data for us; nothing else receives it.
      </p>

      <h2>What we send to other services</h2>
      <p>
        For a real family, nothing from your household goes to an outside service today. The planner, which uses Gemma
        (through Cloudflare or OpenRouter), TabPFN (Prior Labs) and SerpApi searches, only runs for the demo households.
        When it does run for families, it may only send anonymized data: no names, addresses, contact details, quotes,
        diary content or people memory. Planning emails go only to the demo's own inbox, never to a real family. Error
        reports to Sentry carry timings and scrubbed errors, with no request bodies, cookies or user details. The full
        list of every service the code may call is in the{" "}
        <Link className="underline underline-offset-4" href="/plan/fremont-demo/privacy">
          privacy table
        </Link>
        ; the build fails if code calls a service that isn't on it.
      </p>

      <h2>Cookies</h2>
      <ul>
        <li>rt_session: your demo visit, for a day.</li>
        <li>rt_account: keeps you signed in, for 30 days or until you sign out.</li>
        <li>rt_challenge: a one-time code during a passkey step, for five minutes.</li>
        <li>rt_phone: on a parent's phone, remembers their link so their check-ins reach your household.</li>
      </ul>
      <p>All are needed for the site to work. There are no advertising or tracking cookies.</p>

      <h2>Your parents' links</h2>
      <p>
        Each parent's link works without a sign-in, like a key. Anyone who has it can open that parent's app, so send it
        only to them.
      </p>

      <h2>Download and delete</h2>
      <p>
        From your household page you can download everything we hold for it as one file, including your parents' diary
        entries, decrypted. You can also delete your household: that removes the household, the phone links, every
        check-in, answer and diary entry, and your sign-in, from the database right away. Remove the passkey from your
        device's settings as well if you like.
      </p>

      <h2>Questions</h2>
      <p>
        There's no support desk. Ask the person who runs Roundtrip through its repository on GitHub,
        Hotragn/roundtrip-family. See also the{" "}
        <Link className="underline underline-offset-4" href="/terms">
          terms
        </Link>
        .
      </p>
    </Prose>
  );
}
