import type { Metadata } from "next";
import Link from "next/link";
import { NotLegalAdvice, Prose } from "@/components/account/prose";

export const metadata: Metadata = { title: "Terms" };

/** The terms of use, in plain language. */
export default function Terms() {
  return (
    <Prose>
      <h1>Terms</h1>
      <NotLegalAdvice />
      <p>Last updated 18 October 2026.</p>

      <h2>What Roundtrip is</h2>
      <p>
        A free planner that suggests outings to real places for visiting parents, with a phone app for them. It is built
        and run by one person, on free hosting, with no promise that it stays up or stays free.
      </p>

      <h2>Safety</h2>
      <p>
        Roundtrip helps you plan; it doesn't look after anyone. Check-ins and alerts can be late or missing when a phone
        is offline or a service is down. In an emergency, call the local emergency number shown in the app. Places,
        events, opening hours and bus times come from public listings and can be wrong, so check them.
      </p>

      <h2>Your part</h2>
      <ul>
        <li>Add your parents only with their agreement, and keep their phone links private.</li>
        <li>Enter first names and the nearest stop only. Don't enter an address.</li>
        <li>Don't use the site to harm anyone, or try to reach another family's household.</li>
      </ul>

      <h2>Your data</h2>
      <p>
        Your household's data is yours. You can download it or delete it at any time from your household page, as the{" "}
        <Link href="/privacy-policy">privacy policy</Link> describes.
      </p>

      <h2>Changes and ending</h2>
      <p>
        These terms may change; the date above shows when. The site may close. If it does, the plan is to say so on this
        page first, so you have time to download your data.
      </p>

      <h2>No warranty</h2>
      <p>
        The site is provided as is, without any warranty. The code is open source under its license in the project's
        repository.
      </p>
    </Prose>
  );
}
