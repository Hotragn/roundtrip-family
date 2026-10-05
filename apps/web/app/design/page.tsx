import type { Metadata } from "next";
import Link from "next/link";
import { Logo, Mark } from "@/components/brand/logo";
import { Panel } from "@/components/shell/panel";
import { TravelLine, TravelLines } from "@/components/travel/travel-line";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Section, Spec, Swatch } from "./_parts";

export const metadata: Metadata = {
  title: "Style guide",
  description: "Every Roundtrip theme, component and token.",
};

const NAV = [
  ["logo", "Logo"],
  ["color", "Color"],
  ["type", "Type"],
  ["lines", "Travel lines"],
  ["themes", "Page themes"],
  ["components", "Components"],
  ["tokens", "System tokens"],
] as const;

const BRAND = [
  ["ink", "#1F2A44", "Text, the parent in the logo"],
  ["sky", "#3E9BE0", "The child in the logo, sky imagery"],
  ["rail", "#3B3F99", "Rail accents"],
  ["sea", "#13A09A", "Sea imagery"],
  ["bus", "#F2A900", "Home, and the one main action per screen"],
  ["paper", "#FBFCFE", "Base background"],
] as const;

const ACCESSIBLE = [
  ["sky-text", "#1C6CB0", "Links and sky-colored text"],
  ["sky-line", "#2F8AD2", "Sky lines and icons"],
  ["sea-text", "#0B716C", "Sea-colored text"],
  ["sea-line", "#119590", "Sea lines and icons"],
  ["rail", "#3B3F99", "Rail text and lines"],
  ["ink", "#1F2A44", "Body text"],
] as const;

const NEUTRALS = ["#F2F4F9", "#E3E7F0", "#C9D0DF", "#8A94AD", "#4A5573", "#1F2A44"];

export default function DesignPage() {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
          <Link href="/" aria-label="Roundtrip home" className="rounded-md">
            <Logo height={28} />
          </Link>
          <span className="text-sm font-medium text-text-muted">Style guide</span>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1200px] grid-cols-12 gap-6 px-6 py-12">
        <nav aria-label="Sections" className="col-span-12 md:col-span-3">
          <ul className="sticky top-24 flex flex-wrap gap-x-4 gap-y-1 md:flex-col">
            {NAV.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-md py-1.5 text-base text-text-muted hover:text-text">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="col-span-12 space-y-20 md:col-span-9">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Roundtrip style guide</h1>
            <p className="mt-3 max-w-[60ch] text-lg text-text-muted">
              One family, many ways to travel. Each page lives in a realistic landscape, and the interface sits on clean
              white panels in front of it.
            </p>
          </div>

          <Section
            id="logo"
            title="Logo"
            intro="The family loop: the parent's half in ink and the child's half in sky rise from a marigold home dot to two heads side by side. Below 32 px the heavier favicon cut is used."
          >
            <Panel className="grid gap-8 p-8 md:grid-cols-[1fr_auto]">
              <div className="flex flex-wrap items-end gap-10">
                <div className="flex items-end gap-8 rounded-lg bg-[#FBFCFE] px-5 py-4 ring-1 ring-[#E3E7F0]">
                  {[16, 32, 64].map((size) => (
                    <figure key={size} className="flex flex-col items-center gap-3">
                      {/* biome-ignore lint/performance/noImgElement: shows the exact raster at each size */}
                      <img src={`/icons/mark-${size}.png`} width={size} height={size} alt="" />
                      <figcaption className="text-xs tabular-nums text-[#4A5573]">{size} px</figcaption>
                    </figure>
                  ))}
                </div>
                <figure className="flex flex-col items-center gap-3">
                  <Mark size={160} />
                  <figcaption className="text-xs tabular-nums text-text-muted">512 px master, shown at 160</figcaption>
                </figure>
              </div>
              <div className="flex items-end gap-6">
                {/* biome-ignore lint/performance/noImgElement: app icon raster */}
                <img src="/icons/icon-192.png" width={96} height={96} alt="App icon" className="rounded-[22px]" />
              </div>
            </Panel>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <Panel className="flex h-36 items-center justify-center p-8">
                {/* biome-ignore lint/performance/noImgElement: static lockup */}
                <img src="/brand/roundtrip-logo.svg" alt="Roundtrip logo on paper" width={253} height={60} />
              </Panel>
              <div className="flex h-36 items-center justify-center rounded-card bg-[#16203A] p-8">
                {/* biome-ignore lint/performance/noImgElement: static lockup */}
                <img src="/brand/roundtrip-logo-dark.svg" alt="Roundtrip logo on night sky" width={253} height={60} />
              </div>
            </div>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-text-muted">
              <li>Clear space of at least the parent head's diameter on every side.</li>
              <li>At least 28 px tall for the logo and 16 px for the favicon.</li>
              <li>Never swap the parent and child colors, separate the halves, or add effects.</li>
            </ul>
          </Section>

          <Section
            id="color"
            title="Color"
            intro="Brand sky and sea are for the logo and large imagery only. Text uses the accessible variants. Ratios are measured against white."
          >
            <h3 className="text-lg font-semibold">Brand</h3>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {BRAND.map(([n, hex, role]) => (
                <Swatch key={n} name={n} hex={hex} role={role} />
              ))}
            </div>
            <h3 className="mt-8 text-lg font-semibold">Accessible variants</h3>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {ACCESSIBLE.map(([n, hex, role]) => (
                <Swatch key={n} name={n} hex={hex} role={role} />
              ))}
            </div>
            <h3 className="mt-8 text-lg font-semibold">Safety colors, reserved</h3>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <Swatch name="signal" hex="#C8102E" role={`For "I'm lost" only`} />
              <Swatch name="home-green" hex="#1E7B4F" role={`For "I'm home" only`} />
            </div>
            <h3 className="mt-8 text-lg font-semibold">Neutrals and dark theme</h3>
            <div className="mt-3 flex overflow-hidden rounded-card border border-line">
              {NEUTRALS.map((hex) => (
                <div key={hex} className="h-16 flex-1" style={{ background: hex }} title={hex} />
              ))}
            </div>
            <div className="mt-4 rounded-card bg-[#16203A] p-6 text-[#E8ECF5]">
              <div className="text-lg font-semibold">Night-sky indigo, never near-black</div>
              <p className="mt-1 text-sm text-[#B0B9CE]">Background #16203A, text #E8ECF5.</p>
            </div>
          </Section>

          <Section
            id="type"
            title="Type"
            intro="Hind for Latin text and Hind Guntur for Telugu, by the Indian Type Foundry. Telugu sets at a line height of about 1.6 so vowel signs and conjuncts never clip."
          >
            <Panel className="divide-y divide-line">
              <div className="p-6">
                <div className="text-display font-semibold tracking-[-0.02em]">Weekdays out, safely home.</div>
                <div className="mt-2 text-xs text-text-muted">Landing headline: clamp(44px, 6vw, 84px), SemiBold</div>
              </div>
              <div className="grid gap-6 p-6 md:grid-cols-2">
                <div>
                  <div className="text-parent-title font-semibold">Fremont Main Library</div>
                  <p className="mt-1 text-parent">Bus 210 · 25 min. Press stop after the big Safeway.</p>
                  <div className="mt-2 text-xs text-text-muted">Parents' app: title 32, body 22</div>
                </div>
                <div lang="te">
                  <div className="text-parent-title font-semibold">ఫ్రీమాంట్ గ్రంథాలయం</div>
                  <p className="mt-1 text-parent">అమ్మా, ఈ రోజు ఏం చేద్దాం? బస్సు 210 పది గంటలకు వస్తుంది.</p>
                  <div className="mt-2 text-xs text-text-muted" lang="en">
                    Hind Guntur, line height 1.6
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="text-driver font-bold tracking-tight">MOWRY AVE</div>
                <div className="mt-2 text-xs text-text-muted">
                  Driver card stop name: 64 px, Bold (the only use of Bold)
                </div>
              </div>
              <div className="space-y-2 p-6">
                {[
                  ["text-3xl", "39"],
                  ["text-2xl", "31"],
                  ["text-xl", "25"],
                  ["text-lg", "20"],
                  ["text-base", "16"],
                  ["text-xs", "13"],
                ].map(([cls, px]) => (
                  <div key={px} className="flex items-baseline gap-4">
                    <span className="w-10 text-xs tabular-nums text-text-muted">{px}</span>
                    <span className={`${cls} font-semibold`}>This week for Sarala and Venkat</span>
                  </div>
                ))}
                <div className="pt-2 text-xs text-text-muted">Dashboard scale: 13, 16, 20, 25, 31, 39</div>
              </div>
            </Panel>
          </Section>

          <Section
            id="lines"
            title="Travel lines"
            intro="Map glyphs, not illustrations. Each way of traveling has its own line, 2 to 3 px, and every line meets 3:1 on white."
          >
            <Panel className="divide-y divide-line">
              {(
                [
                  ["sky", "Sky: a fine dotted arc"],
                  ["rail", "Rail: a line with subtle ties"],
                  ["sea", "Sea: a gentle wave"],
                  ["bus", "Bus: a solid line with stops, on a thin ink casing"],
                  ["walk", "Walk: a fine dotted line"],
                ] as const
              ).map(([mode, label]) => (
                <div key={mode} className="flex items-center gap-6 px-6 py-4">
                  <span className="w-72 text-base">{label}</span>
                  <TravelLine mode={mode} width={260} stops={3} />
                </div>
              ))}
              <div className="px-6 py-5">
                <div className="mb-3 text-sm text-text-muted">A ticket's legs, in proportion to their minutes</div>
                <TravelLines
                  width={440}
                  label="Walk 4 minutes, bus 210 for 14 minutes with 6 stops, walk 3 minutes"
                  legs={[
                    { mode: "walk", minutes: 4 },
                    { mode: "bus", minutes: 14, stops: 6 },
                    { mode: "walk", minutes: 3 },
                  ]}
                />
              </div>
            </Panel>
          </Section>

          <Section
            id="themes"
            title="Page themes"
            intro="Every page belongs to one way of traveling. Text never sits on imagery; it sits on white panels."
          >
            <div className="grid gap-4 md:grid-cols-5">
              {(
                [
                  ["sky", "Landing", "A light morning sky"],
                  ["rail", "Dashboard", "A railway at golden hour"],
                  ["sea", "Safety and privacy", "Calm open water"],
                  ["road", "Parents' app", "Clean white, built for speed"],
                  ["home", "Diary and memory book", "Warm daylight"],
                ] as const
              ).map(([theme, page, look]) => (
                <div key={theme} data-theme={theme} className="rounded-card border border-line bg-paper p-4">
                  <div className="text-xs font-medium text-text-muted">{page}</div>
                  <div className="mt-1 text-lg font-semibold text-accent-text">{theme}</div>
                  <div className="mt-1 text-sm text-text-muted">{look}</div>
                  <div className="mt-4 h-1 rounded-full bg-accent-line" />
                </div>
              ))}
            </div>
          </Section>

          <Section
            id="components"
            title="Components"
            intro="Base pieces. Ticket, driver card and the dashboard board follow."
          >
            <Panel className="space-y-8 p-6">
              <div>
                <div className="mb-3 text-sm font-medium text-text-muted">Buttons</div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button>See a week</Button>
                  <Button variant="secondary">Swap</Button>
                  <Button variant="quiet">Cancel</Button>
                  <Button variant="link">Privacy table</Button>
                </div>
              </div>
              <div>
                <div className="mb-3 text-sm font-medium text-text-muted">Parents' app sizes, 56 px tap targets</div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="parent">Show the driver</Button>
                  <Button size="parent" variant="home">
                    I'm home
                  </Button>
                  <Button size="parent" variant="lost">
                    I'm lost
                  </Button>
                </div>
              </div>
              <div>
                <div className="mb-3 text-sm font-medium text-text-muted">Reason chips</div>
                <div className="flex flex-wrap gap-2">
                  <Chip tone="for">Speaks their language</Chip>
                  <Chip tone="for">One bus, under 30 minutes</Chip>
                  <Chip tone="against">Afternoon nap time</Chip>
                  <Chip>Same language</Chip>
                </div>
              </div>
            </Panel>
          </Section>

          <Section id="tokens" title="System tokens">
            <Panel className="px-6 py-2">
              <Spec label="Spacing">
                <div className="flex items-end gap-3">
                  {[4, 8, 12, 16, 24, 32, 48, 64, 96].map((s) => (
                    <div key={s} className="flex flex-col items-center gap-1.5">
                      <div className="bg-sky-line" style={{ width: s, height: s }} />
                      <span className="text-xs tabular-nums text-text-muted">{s}</span>
                    </div>
                  ))}
                </div>
              </Spec>
              <Spec label="Radius">
                <div className="flex gap-4">
                  {[
                    ["8", "Inputs and chips", "rounded-chip"],
                    ["14", "Cards", "rounded-card"],
                    ["20", "Tickets", "rounded-ticket"],
                  ].map(([px, use, cls]) => (
                    <div key={px} className={`${cls} border border-line-strong px-4 py-3 text-sm`}>
                      {px} px · {use}
                    </div>
                  ))}
                </div>
              </Spec>
              <Spec label="Elevation">
                <div className="flex gap-6">
                  <div className="rounded-card bg-surface px-5 py-4 text-sm shadow-raised">Raised</div>
                  <div className="rounded-card bg-surface px-5 py-4 text-sm shadow-overlay">Overlay</div>
                </div>
              </Spec>
              <Spec label="Focus">
                <span className="inline-block rounded-md px-3 py-1.5 text-sm outline-3 outline-offset-2 outline-focus">
                  3 px sky-text outline, offset 2 px
                </span>
              </Spec>
              <Spec label="Grid">
                <span className="text-sm">
                  Dashboard: 12 columns, 1200 px, 24 px gutters. Parents' app: one 480 px column, 20 px margins.
                </span>
              </Spec>
            </Panel>
          </Section>
        </main>
      </div>
    </div>
  );
}
