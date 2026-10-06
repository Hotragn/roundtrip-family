import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { LANGUAGES, type LanguageRecord, languageNameIn, type Readiness } from "@roundtrip/core";
import { repoRoot } from "@roundtrip/core/server-env";
import { BookOpenText, Ear, PenLine, Volume2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReadinessChip } from "@/components/dashboard/readiness";
import { DashboardShell } from "@/components/dashboard/shell";
import { Panel } from "@/components/shell/panel";
import { DEMO_WEEKS } from "@/lib/demo-weeks";
import { HOUSEHOLDS, isHousehold, loadBoard } from "@/lib/plan-board";
import type { WeekView } from "@/lib/week";

export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(HOUSEHOLDS).map((household) => ({ household }));
}

export const metadata: Metadata = { title: "Languages" };

/** Audio clips the speech pipeline saved for the demo (speech/ writes them to data/demo/audio/). */
function audioClips(): number {
  const dir = join(repoRoot(), "data/demo/audio");
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { recursive: true }).filter((f) => /\.(wav|mp3|ogg|opus|m4a)$/i.test(String(f))).length;
}

function Capability({
  icon: Icon,
  title,
  status,
  chip,
  children,
}: {
  icon: typeof BookOpenText;
  title: string;
  status: Readiness | "phone";
  chip?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid gap-x-4 gap-y-1 border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[13rem_1fr]">
      <div className="flex items-start gap-2.5">
        <Icon aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 stroke-[1.75] text-text-muted" />
        <div className="space-y-1.5">
          <p className="font-semibold leading-snug">{title}</p>
          <ReadinessChip status={status}>{chip}</ReadinessChip>
        </div>
      </div>
      <div className="space-y-1 text-[15px] leading-relaxed">{children}</div>
    </li>
  );
}

/** Languages: what's ready in each parent's language and in the local one (docs/plan.md, Choosing a language). */
export default async function Languages({ params }: PageProps<"/plan/[household]/languages">) {
  const { household } = await params;
  if (!isHousehold(household)) notFound();
  const board = loadBoard(household);
  const week = DEMO_WEEKS[household] as WeekView;
  const local = board.household.localLanguage;
  const localName = languageNameIn(local, "en");

  // One section per language the parents use, with who uses it.
  const used = [...new Set(board.parents.map((p) => p.language))];
  const cards = week.outings.flatMap((o) => o.cards);
  const clips = audioClips();

  return (
    <DashboardShell household={household} weekLabel={board.week.label} parents={board.parents}>
      <div className="space-y-8">
        <div className="max-w-[720px] space-y-2">
          <h1 className="text-[31px] font-semibold leading-tight">Languages</h1>
          <p className="text-base text-text-muted">
            What Roundtrip can do in each parent&rsquo;s language, and in {localName}, the language around them. Each
            parent picks their own language in setup. Bus, street and venue names always stay as the signs write them.
          </p>
        </div>

        {used.map((code) => {
          const rec = LANGUAGES.find((l) => l.code === code) as LanguageRecord | undefined;
          if (!rec) return null;
          const who = board.parents.filter((p) => p.language === code).map((p) => p.firstName);
          const mine = cards.filter((c) => week.parents.find((p) => p.id === c.parentId)?.language === code);
          const passing = mine.filter((c) => c.rubric?.passed).length;
          const tunedCards = mine.filter((c) => c.writer?.kind === "tinker_lora").length;
          const tuned = tunedCards > 0;
          return (
            <Panel key={code} className="p-5 sm:p-6">
              <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-[25px] font-semibold leading-tight">
                  <span lang={code}>{rec.nativeName}</span>
                  <span className="text-text-muted">, {rec.name}</span>
                </h2>
                <p className="text-[15px] text-text-muted">for {who.join(" and ")}</p>
              </div>
              <ul>
                <Capability icon={BookOpenText} title="Reading and planning" status={rec.reading.status}>
                  <p>
                    {rec.reading.model} reads event listings in any language, picks out the ones in {rec.name}, and
                    writes the reasons you see on each outing.
                  </p>
                </Capability>
                <Capability
                  icon={PenLine}
                  title="Writing their cards"
                  status={tuned ? "ready" : rec.cardWriter.status}
                  chip={tuned ? "Tuned for this language" : undefined}
                >
                  <p>
                    {tuned
                      ? `A card writer tuned for ${rec.name} writes each ticket in the plain, respectful register in the style guide; this week it wrote ${tunedCards} of ${mine.length}. Every card also has to pass Gemma's review of tone and facts and say the walk from the stop, and where a tuned card didn't, Gemma wrote it.`
                      : `${rec.cardWriter.model} writes each ticket, held to the ${rec.name} style guide.`}{" "}
                    This week: {mine.length} {mine.length === 1 ? "card" : "cards"}, {passing} passing every check of
                    the card rubric (length, every name exact, the right form of address, the script intact).
                  </p>
                  {!tuned && rec.cardWriter.status !== "ready" ? (
                    <p className="text-[13px] text-text-muted">
                      A writer tuned for one language (a small LoRA adapter trained on examples in the style guide)
                      replaces the general model only when it scores higher on the same rubric.
                    </p>
                  ) : null}
                </Capability>
                <Capability
                  icon={Volume2}
                  title="Reading aloud"
                  status={clips > 0 ? rec.speaking.status : "phone"}
                  chip={clips > 0 ? undefined : "The phone's voice"}
                >
                  <p>
                    {clips > 0
                      ? `${rec.speaking.model} reads their tickets and phrases aloud: ${clips} clips in this demo, made on the family's own hardware.`
                      : `Every screen has a listen button. In this demo it uses the phone's own ${rec.name} voice when the phone has one; the open model for ${rec.name} is ${rec.speaking.model}, run on the family's own hardware.`}
                  </p>
                </Capability>
                <Capability icon={Ear} title="Listening" status={clips > 0 ? rec.listening.status : "phone"}>
                  <p>
                    Their spoken answers to &ldquo;How was it?&rdquo; and their diary are transcribed by{" "}
                    {rec.listening.model}, on the family&rsquo;s own hardware, never a hosted service.
                    {clips > 0 ? "" : " In this demo the recordings stay on the phone."}
                  </p>
                </Capability>
              </ul>
            </Panel>
          );
        })}

        <Panel className="p-5 sm:p-6">
          <h2 className="text-[20px] font-semibold">{localName}, the language around them</h2>
          <ul className="mt-4 grid gap-4 md:grid-cols-3">
            <li className="space-y-1">
              <p className="font-semibold">Phrases to practise</p>
              <p className="text-[15px] leading-relaxed text-text-muted">
                A few {localName} phrases for each outing, with how to say them written in their own script underneath.
              </p>
            </li>
            <li className="space-y-1">
              <p className="font-semibold">The driver card</p>
              <p className="text-[15px] leading-relaxed text-text-muted">
                Large {localName} text to show the driver: where they&rsquo;re going and the stop to get off at.
              </p>
            </li>
            <li className="space-y-1">
              <p className="font-semibold">The help card</p>
              <p className="text-[15px] leading-relaxed text-text-muted">
                &ldquo;{board.household.localPhrases.helpTitle}&rdquo; and your number, for a stranger to read.
              </p>
            </li>
          </ul>
        </Panel>

        <section aria-labelledby="all" className="space-y-3">
          <h2 id="all" className="text-[20px] font-semibold">
            Every language set up so far
          </h2>
          <p className="text-[15px] text-text-muted">What the models for each language support.</p>
          <Panel className="overflow-x-auto p-5 sm:p-6">
            <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-b border-line-strong text-[13px]">
                  <th scope="col" className="py-2.5 pr-3 font-semibold">
                    Language
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    Reading
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    Cards
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    Reading aloud
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    Listening
                  </th>
                </tr>
              </thead>
              <tbody>
                {LANGUAGES.map((l) => (
                  <tr key={l.code} className="border-b border-line align-top last:border-0">
                    <td className="py-3 pr-3">
                      <p className="font-semibold">
                        {l.name}{" "}
                        {l.nativeName !== l.name ? (
                          <span lang={l.code} className="font-normal text-text-muted">
                            {l.nativeName}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[13px] text-text-muted">{l.script} script</p>
                    </td>
                    {[l.reading, l.cardWriter, l.speaking, l.listening].map((c, i) => (
                      <td key={i} className="px-3 py-3">
                        <ReadinessChip status={c.status} />
                        <p className="mt-1 text-[13px] text-text-muted">{c.model}</p>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <p className="text-[13px] text-text-muted">
            A household can use any language: setup adds it here, shows what each part can do, and uses a general model
            wherever a tuned one isn&rsquo;t ready.
          </p>
        </section>
      </div>
    </DashboardShell>
  );
}
