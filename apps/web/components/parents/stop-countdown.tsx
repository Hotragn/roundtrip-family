"use client";

import { MapPin, Navigation } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { LegView } from "@/lib/week";

/**
 * When to press stop: a precise line diagram of the trip, stop by stop, with the stop before
 * theirs called out. No map library: it's an SVG-free CSS diagram that works offline.
 */

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export type GpsState = "off" | "locating" | "tracking" | "next" | "here" | "unavailable";

/**
 * Watches the phone's position (GPS works without mobile data) and says when the stop before
 * theirs is close: "your stop is next". Nothing leaves the phone.
 */
export function useStopAlert(stopBefore?: { lat: number; lng: number }, stop?: { lat: number; lng: number }) {
  const [state, setState] = useState<GpsState>("off");
  const watch = useRef<number | null>(null);
  const alerted = useRef(false);
  const start = () => {
    if (!("geolocation" in navigator)) return setState("unavailable");
    setState("locating");
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (stop && haversineM(here, stop) < 120) return setState("here");
        if (stopBefore && haversineM(here, stopBefore) < 250) {
          if (!alerted.current) navigator.vibrate?.([120, 80, 120]);
          alerted.current = true;
          return setState("next");
        }
        setState("tracking");
      },
      () => setState("unavailable"),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  };
  useEffect(
    () => () => {
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    },
    [],
  );
  return { state, start };
}

const Track = ({ kind, first, last }: { kind: "bus" | "rail" | "walk"; first?: boolean; last?: boolean }) => (
  <div aria-hidden="true" className="absolute left-[18px] top-0 bottom-0 w-[6px]">
    {kind === "walk" ? (
      <div className="mx-auto h-full w-0 border-l-[3px] border-dotted border-text-muted" />
    ) : (
      <div
        className={cn("mx-auto h-full w-[6px] rounded-full", first && "mt-[22px]", last && "mb-[22px]")}
        style={{ background: kind === "rail" ? "var(--rail-line)" : "var(--ink)" }}
      >
        {kind === "bus" ? <div className="mx-auto h-full w-[3px] rounded-full bg-bus" /> : null}
      </div>
    )}
  </div>
);

const Node = ({ size = "sm", tone = "plain" }: { size?: "sm" | "lg"; tone?: "plain" | "before" | "mine" }) => (
  <span
    aria-hidden="true"
    className={cn(
      "absolute left-[21px] top-[14px] -translate-x-1/2 rounded-full",
      size === "lg" ? "size-[22px] border-[4px]" : "size-[14px] border-[2.5px]",
      tone === "mine" ? "border-ink bg-ink" : tone === "before" ? "border-ink bg-bus" : "border-ink bg-surface",
    )}
  />
);

export function StopCountdown({
  legs,
  venue,
  nameLang = "en",
  labels,
  gps,
}: {
  legs: LegView[];
  venue: string;
  /** Language of stop, line and venue names: the household's local language. */
  nameLang?: string;
  labels: {
    yourStop: string;
    pressAfter: (stop: string) => string;
    stopsToGo: (n: number) => string;
    walk: string;
    minutes: (n: number) => string;
  };
  gps: GpsState;
}) {
  const rows: Array<{
    key: string;
    kind: "bus" | "rail" | "walk";
    node?: "plain" | "before" | "mine" | "start";
    title: string;
    /** The title is a stop name, kept exactly as on the signs. */
    titleIsName?: boolean;
    sub?: string;
    /** The sub line is a line name and headsign. */
    subIsName?: boolean;
    first?: boolean;
    last?: boolean;
    strong?: boolean;
  }> = [];
  for (const [i, leg] of legs.entries()) {
    if (leg.mode === "walk") {
      rows.push({
        key: `w${i}`,
        kind: "walk",
        title: `${labels.walk} · ${labels.minutes(leg.durationMinutes)}`,
        sub: i === legs.length - 1 ? venue : leg.to.name,
        subIsName: true,
      });
      continue;
    }
    const kind = leg.mode === "rail" ? "rail" : "bus";
    rows.push({
      key: `s${i}`,
      kind,
      node: "start",
      title: leg.from.name,
      titleIsName: true,
      sub: `${leg.line?.name ?? ""} ${leg.line?.headsign ?? ""}`.trim(),
      subIsName: true,
      first: true,
      strong: true,
    });
    const between = leg.stopsBetween ?? [];
    for (const [j, s] of between.entries()) {
      const isBefore = j === between.length - 1;
      rows.push({
        key: `b${i}-${j}`,
        kind,
        node: isBefore ? "before" : "plain",
        title: s.name,
        titleIsName: true,
        sub: isBefore ? labels.pressAfter(s.name) : labels.stopsToGo(between.length - j),
        strong: isBefore,
      });
    }
    rows.push({
      key: `e${i}`,
      kind,
      node: "mine",
      title: leg.to.name,
      titleIsName: true,
      sub: labels.yourStop,
      last: true,
      strong: true,
    });
  }
  return (
    <ol className="relative">
      {rows.map((r) => (
        <li
          key={r.key}
          className={cn(
            "relative min-h-[52px] pb-3 pl-14",
            r.node === "before" && gps === "next" && "rounded-xl bg-bus/15",
          )}
        >
          <Track kind={r.kind} first={r.first} last={r.last} />
          {r.node ? (
            <Node
              size={r.node === "mine" || r.node === "start" ? "lg" : "sm"}
              tone={r.node === "start" ? "plain" : r.node}
            />
          ) : null}
          {r.kind === "walk" ? (
            <Navigation
              aria-hidden="true"
              className="absolute left-[11px] top-[10px] size-5 rounded-full bg-surface stroke-[1.75] text-text-muted"
            />
          ) : null}
          <div className="pt-2">
            <div
              className={cn("text-[20px]", r.strong ? "font-semibold" : "text-text")}
              lang={r.titleIsName ? nameLang : "te"}
            >
              {r.title}
            </div>
            {r.sub ? (
              <div
                className={cn("text-[17px]", r.node === "before" ? "font-semibold text-text" : "text-text-muted")}
                lang={r.subIsName ? nameLang : "te"}
              >
                {r.node === "mine" ? <MapPin aria-hidden="true" className="mr-1 inline size-4 align-[-2px]" /> : null}
                {r.sub}
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
