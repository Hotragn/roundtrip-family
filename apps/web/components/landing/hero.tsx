import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Panel } from "@/components/shell/panel";
import { cn } from "@/lib/utils";
import { primaryButton, secondaryButton } from "./ui";

/**
 * The first screen: the live sky behind, the headline on a white panel to the left, and the two
 * ways in: the dashboard (for the adult child) and the parents' phone. On phones the panel sits low, so the sky and the coast stay in view above it.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative flex min-h-svh flex-col">
      <header className="px-4 pt-10 sm:px-8 lg:px-12">
        <Panel className="inline-flex rounded-[12px] px-3.5 py-2.5">
          <Logo height={28} />
        </Panel>
      </header>
      <div className="flex flex-1 items-end px-4 pt-10 pb-4 sm:px-8 sm:pb-8 lg:items-center lg:px-12 lg:pt-0 lg:pb-12">
        <Panel className="w-full max-w-[42rem] rounded-[20px] p-6 sm:p-10 lg:p-12">
          <h1 id="hero-title" className="text-display font-semibold tracking-[-0.03em] text-text">
            <span className="block">Weekdays out,</span>
            <span className="block">safely home.</span>
          </h1>
          <p className="mt-5 max-w-[33rem] text-lg text-text-muted sm:mt-6 sm:text-xl sm:leading-[1.45]">
            Roundtrip plans two or three outings a week for parents visiting from abroad: real places and real people
            who speak their language, on trips they can manage on their own.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3 sm:mt-9">
            <Link href="/plan" className={primaryButton}>
              See the week you'd plan
            </Link>
            <a href="/parents/fremont-demo/p_sarala" className={secondaryButton}>
              See their phone
            </a>
          </div>
          <p className="mt-4 text-[15px] text-text-muted">
            No sign-up. Try it with a fictional family, Sarala and Venkat in Fremont.
          </p>
        </Panel>
      </div>
    </section>
  );
}
