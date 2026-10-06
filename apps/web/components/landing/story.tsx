import Link from "next/link";
import type { ReactNode } from "react";
import { Panel } from "@/components/shell/panel";
import { cn } from "@/lib/utils";
import { demoWeek } from "./demo";
import { Aircraft, CountriesPreview, DiaryPreview, HomePreview, TicketPreview, WeekPreview } from "./previews";
import { primaryButton, secondaryButton } from "./ui";

/**
 * How a week works, as a short story on white panels over the sky as the camera keeps
 * climbing. Panels step left and right on wide screens and stack on phones.
 */

const PHONE = "/parents/fremont-demo/p_sarala";

function Step({
  id,
  side,
  title,
  children,
  preview,
}: {
  id: string;
  side: "left" | "right";
  title: string;
  children: ReactNode;
  preview?: ReactNode;
}) {
  return (
    <article
      aria-labelledby={`${id}-title`}
      className={cn("lg:w-[32rem]", side === "right" ? "lg:ml-auto lg:mr-[6vw]" : "lg:ml-0")}
    >
      <Panel className="rounded-[20px] p-6 sm:p-8">
        <h3 id={`${id}-title`} className="text-[25px] font-semibold leading-tight tracking-[-0.015em] sm:text-[28px]">
          {title}
        </h3>
        <div className="mt-3 space-y-3 text-base text-text-muted sm:text-[17px] sm:leading-[1.6]">{children}</div>
        {preview}
      </Panel>
    </article>
  );
}

export function Story() {
  const week = demoWeek();
  return (
    <div className="px-4 pb-24 sm:px-8 lg:px-12">
      <section
        id="how"
        aria-labelledby="how-title"
        className="scroll-mt-8 space-y-[14vh] pt-[18vh] lg:space-y-[22vh] lg:pt-[26vh]"
      >
        <Panel className="max-w-[32rem] rounded-[20px] p-6 sm:p-8">
          <h2 id="how-title" className="text-[31px] font-semibold leading-tight tracking-[-0.02em] sm:text-[39px]">
            How a week works
          </h2>
          <p className="mt-3 text-base text-text-muted sm:text-[17px] sm:leading-[1.6]">
            You plan with them on Sunday. On weekdays they go out on their own, to places with people who speak their
            language, and come home safely.
          </p>
        </Panel>

        <Step id="sunday" side="right" title="On Sunday, you choose the week" preview={<WeekPreview week={week} />}>
          <p>
            Roundtrip suggests outings near home for each parent, at times that suit them, and you approve two or three.
            Every suggestion is a real place or a real group, with a short reason you can check.
          </p>
        </Step>

        <Step
          id="day"
          side="left"
          title="On the day, a ticket in their language"
          preview={<TicketPreview week={week} />}
        >
          <p>
            Each parent's phone shows the outing as a ticket, in Telugu for our demo family: which bus to take and when
            to press stop, starting from the nearest bus stop. It works with no connection, and a card in English shows
            the driver where they are going.
          </p>
        </Step>

        <Step id="home" side="right" title="Home again, with one tap" preview={<HomePreview week={week} />}>
          <p>
            Back home, they tap I'm home and the family knows. If it hasn't come{" "}
            {week.safety ? `${week.safety.buffer} minutes` : "a while"} after they were due, the app checks on them, and
            {week.safety ? ` ${week.safety.wait} minutes` : " soon"} later you get an email with the outing's details.
          </p>
        </Step>

        <Step id="words" side="left" title="Their own words, kept private" preview={<DiaryPreview week={week} />}>
          <p>
            A diary for a few words or a voice note after an outing, and a memory book of the places they went. Both are
            private by default: nothing is shared unless they choose to share it.
          </p>
        </Step>
      </section>

      <section aria-labelledby="country-title" className="mt-[14vh] lg:mt-[22vh]">
        <Panel className="max-w-[32rem] rounded-[20px] p-6 sm:p-8 lg:ml-auto lg:mr-[6vw]">
          <div className="flex items-center justify-between gap-4">
            <h2
              id="country-title"
              className="text-[25px] font-semibold leading-tight tracking-[-0.015em] sm:text-[28px]"
            >
              Works in any country
            </h2>
            <Aircraft className="h-[25px] w-[88px] shrink-0" />
          </div>
          <p className="mt-3 text-base text-text-muted sm:text-[17px] sm:leading-[1.6]">
            Each family sets the country they are staying in and its language. Driver cards, phrases and emergency
            numbers follow. The demo has two fictional families, one in Fremont, California and one in München, Germany.
          </p>
          <CountriesPreview />
        </Panel>
      </section>

      <section aria-labelledby="see-title" className="mt-[14vh] lg:mt-[22vh]">
        <Panel className="mx-auto max-w-[40rem] rounded-[20px] p-6 text-left sm:p-10">
          <h2 id="see-title" className="text-[31px] font-semibold leading-tight tracking-[-0.02em] sm:text-[39px]">
            See the week we planned
          </h2>
          <p className="mt-3 text-base text-text-muted sm:text-[17px] sm:leading-[1.6]">
            Look over {week.name}'s outings on the dashboard, or open her phone to see the ticket she carries, in
            Telugu.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/plan" className={primaryButton}>
              See a week
            </Link>
            <a href={PHONE} className={secondaryButton}>
              Open {week.name}'s phone
            </a>
          </div>
          <p className="mt-6 text-sm text-text-muted">
            The families in the demo are fictional. The places, events and bus routes come from real searches.
          </p>
        </Panel>
      </section>
    </div>
  );
}
