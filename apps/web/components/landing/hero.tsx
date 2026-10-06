import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Panel } from "@/components/shell/panel";
import { primaryButton } from "./ui";

const navLink =
  "inline-flex h-11 items-center rounded-[10px] px-3 text-[15px] text-text-muted transition-colors duration-200 ease-paper hover:bg-surface-sunken hover:text-text";

/**
 * The first screen: the live sky behind, the headline on a white panel to the left, and the two
 * ways in: the dashboard (for the adult child) and the parents' phone. On phones the panel sits low, so the sky and the coast stay in view above it.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative flex min-h-svh flex-col">
      {/* A floating bar, clear of the flight path along the top edge. */}
      <header className="px-4 pt-10 sm:px-8 lg:px-12">
        <Panel className="flex w-full max-w-[64rem] items-center gap-2 rounded-[16px] py-2 pr-2 pl-4">
          <Link href="/" aria-label="Roundtrip home" className="mr-auto rounded-md">
            <Logo height={26} />
          </Link>
          <nav aria-label="On this page" className="hidden items-center gap-1 sm:flex">
            <a href="#how" className={navLink}>
              How it works
            </a>
            <a href="/parents/fremont-demo/p_sarala" className={navLink}>
              Their phone
            </a>
            <Link href="/plan/fremont-demo/privacy" className={navLink}>
              Privacy
            </Link>
          </nav>
          <Link
            href="/plan"
            className="inline-flex h-11 items-center rounded-[10px] bg-[#1F2A44] px-4 text-[15px] font-semibold text-white transition-colors duration-200 ease-paper hover:bg-[#2b3858]"
          >
            Open the demo
          </Link>
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
            <a
              href="/parents/fremont-demo/p_sarala"
              className="rounded-md px-2 py-3 text-lg font-semibold text-text underline decoration-line-strong underline-offset-[6px] hover:decoration-text"
            >
              Or see their phone
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
