"use client";

import { DndContext } from "@dnd-kit/core";
import type { OutboundRoute } from "@roundtrip/core/privacy";
import dynamic from "next/dynamic";
import { PlacePhoto } from "@/components/dashboard/place-photo";
import { PrivacyTable } from "@/components/dashboard/privacy-table";
import { DashboardProviders } from "@/components/dashboard/providers";
import { ReadinessChip } from "@/components/dashboard/readiness";
import { LadderBadge, ReasonChips } from "@/components/dashboard/reason";
import { SafetyTimeline } from "@/components/dashboard/safety-settings";
import { SuggestionCard } from "@/components/dashboard/suggestion-card";
import type { EffectiveItem } from "@/components/dashboard/use-overlay";
import { whoShort } from "@/lib/plan-format";
import type { PlanBoard } from "@/lib/plan-types";

// MapLibre loads only when a route map is on screen, as on the board.
const RouteMap = dynamic(() => import("@/components/dashboard/route-map").then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-card bg-surface-sunken" />,
});

function Specimen({ name, children, wide }: { name: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <figure className={wide ? "md:col-span-2" : undefined}>
      <figcaption className="mb-2 font-mono text-[12px] text-text-muted">{name}</figcaption>
      <div className="rounded-card bg-paper p-4 ring-1 ring-line">{children}</div>
    </figure>
  );
}

/** The dashboard's components on the style guide, rendered with the Fremont demo week. */
export function DashboardGallery({ board, routes }: { board: PlanBoard; routes: OutboundRoute[] }) {
  const pick = board.items.find((i) => i.legs.some((l) => l.mode !== "walk")) ?? board.items[0]!;
  const approved: EffectiveItem = { ...pick, slotId: pick.id, status: "approved", swapped: false };
  const open = board.items.find((i) => i.defaultStatus === "suggested") ?? pick;
  const toDecide: EffectiveItem = { ...open, slotId: open.id, status: "suggested", swapped: false };
  const parent = board.parents.find((p) => pick.parentIds.includes(p.id));

  return (
    <DashboardProviders>
      <DndContext id="design-gallery">
        <div className="grid gap-6 md:grid-cols-2">
          <Specimen name="SuggestionCard (approved, and one to decide)" wide>
            <div className="grid max-w-[420px] grid-cols-2 gap-3">
              {[approved, toDecide].map((item) => (
                <SuggestionCard
                  key={item.slotId}
                  item={item}
                  who={whoShort(item, board)}
                  lang={board.household.localLanguage}
                  swapCount={(board.alternatives[item.slotId] ?? []).length}
                  onOpen={() => {}}
                  onApprove={() => {}}
                  onUnapprove={() => {}}
                  onSwap={() => {}}
                />
              ))}
            </div>
          </Specimen>

          <Specimen name="ReasonChips and the fallback-ladder level">
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((level) => (
                <LadderBadge
                  key={level}
                  level={level}
                  label={
                    [
                      "In their language",
                      "Shared culture",
                      "Language barely matters",
                      "Programs for newcomers and older adults",
                      "A regular routine",
                    ][level - 1]!
                  }
                />
              ))}
              <ReasonChips chips={pick.chips} />
            </div>
          </Specimen>

          <Specimen name="PlacePhoto (loaded, and the tile when a photo won't load)">
            <div className="grid grid-cols-2 gap-3">
              <PlacePhoto
                url={pick.photo?.url}
                width={480}
                height={270}
                category={pick.category}
                className="aspect-[16/9] w-full rounded-md"
              />
              <PlacePhoto
                url={null}
                width={480}
                height={270}
                category="temple"
                className="aspect-[16/9] w-full rounded-md"
              />
            </div>
          </Specimen>

          <Specimen name="RouteMap (MapLibre, OpenFreeMap tiles)" wide>
            <div className="h-[300px]">
              <RouteMap legs={pick.legs} venue={pick.location} label={`Map of the route to ${pick.title}`} />
            </div>
          </Specimen>

          <Specimen name="SafetySettings: the outing timer">
            {parent ? (
              <SafetyTimeline
                example={{
                  who: parent.firstName,
                  place: pick.title,
                  day: "Monday",
                  depart: pick.depart,
                  back: pick.back,
                }}
                buffer={board.household.safety.bufferMinutes}
                wait={board.household.safety.nudgeWaitMinutes}
              />
            ) : null}
          </Specimen>

          <Specimen name="LanguageReadiness">
            <div className="flex flex-wrap gap-2">
              <ReadinessChip status="ready" />
              <ReadinessChip status="fallback" />
              <ReadinessChip status="needs_tuning" />
              <ReadinessChip status="unavailable" />
              <ReadinessChip status="phone">The phone&rsquo;s voice</ReadinessChip>
            </div>
          </Specimen>

          <Specimen name="PrivacyTable (first five routes)" wide>
            <PrivacyTable routes={routes.slice(0, 5)} />
          </Specimen>
        </div>
      </DndContext>
    </DashboardProviders>
  );
}
