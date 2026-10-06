"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { BoardLeg } from "@/lib/plan-types";

/**
 * One outing's route as a realistic map: MapLibre GL with OpenFreeMap's vector tiles
 * (https://openfreemap.org/, no key), restyled in muted brand tones, tilted gently to show 3D
 * buildings, each leg drawn as a clean line in its mode's style: bus a marigold line with an
 * ink casing, rail the rail colour with sleepers, walking a fine dotted ink line. MapLibre is
 * loaded only when a route opens. Docs: https://maplibre.org/maplibre-gl-js/docs/API/
 */

const STYLE = "https://tiles.openfreemap.org/styles/positron";
const BRAND = {
  land: "#f4f6fa",
  water: "#cfe5e3",
  park: "#e4ece4",
  building: "#e3e7f0",
  label: "#4a5573",
  ink: "#1f2a44",
  bus: "#f2a900",
  rail: "#3b3f99",
};

function restyle(map: MapLibreMap) {
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id;
    try {
      if (layer.type === "background") map.setPaintProperty(id, "background-color", BRAND.land);
      else if (id === "water") map.setPaintProperty(id, "fill-color", BRAND.water);
      else if (id === "park" || id === "landcover_wood") map.setPaintProperty(id, "fill-color", BRAND.park);
      else if (id === "building") map.setLayoutProperty(id, "visibility", "none");
      else if (layer.type === "symbol") {
        map.setPaintProperty(id, "text-color", BRAND.label);
        map.setPaintProperty(id, "text-halo-color", "#ffffff");
      }
    } catch {
      // A layer without that property: leave it as the style draws it.
    }
  }
  map.addLayer({
    id: "buildings-3d",
    type: "fill-extrusion",
    source: "openmaptiles",
    "source-layer": "building",
    minzoom: 14,
    paint: {
      "fill-extrusion-color": BRAND.building,
      "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
      "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
      "fill-extrusion-opacity": 0.85,
    },
  });
}

function drawRoute(map: MapLibreMap, legs: BoardLeg[], venue: { lat: number; lng: number } | null) {
  const features = legs
    .filter((l) => l.path.length > 1)
    .map((l) => ({
      type: "Feature" as const,
      properties: { mode: l.mode === "rail" ? "rail" : l.mode === "walk" ? "walk" : "bus" },
      geometry: { type: "LineString" as const, coordinates: l.path },
    }));
  map.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features } });
  const mode = (m: string) => ["==", ["get", "mode"], m] as ["==", ["get", string], string];
  map.addLayer({
    id: "bus-casing",
    type: "line",
    source: "route",
    filter: mode("bus"),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": BRAND.ink, "line-width": 7 },
  });
  map.addLayer({
    id: "bus",
    type: "line",
    source: "route",
    filter: mode("bus"),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": BRAND.bus, "line-width": 4.5 },
  });
  map.addLayer({
    id: "rail",
    type: "line",
    source: "route",
    filter: mode("rail"),
    layout: { "line-join": "round" },
    paint: { "line-color": BRAND.rail, "line-width": 4 },
  });
  map.addLayer({
    id: "rail-ties",
    type: "line",
    source: "route",
    filter: mode("rail"),
    paint: { "line-color": BRAND.rail, "line-width": 10, "line-dasharray": [0.25, 1.6], "line-opacity": 0.75 },
  });
  map.addLayer({
    id: "walk",
    type: "line",
    source: "route",
    filter: mode("walk"),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": BRAND.ink, "line-width": 3, "line-dasharray": [0.1, 1.8] },
  });

  // Where they start (the stop nearest home), the stops where they get on and off, and the place.
  const start = legs.find((l) => l.path.length > 1)?.path[0];
  const stops = [
    ...(start ? [{ lng: start[0], lat: start[1] }] : []),
    ...legs.filter((l) => l.mode !== "walk").flatMap((l) => [l.from.location, l.to.location]),
  ].filter((p): p is { lat: number; lng: number } => Boolean(p));
  map.addSource("stops", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [
        ...stops.map((p) => ({
          type: "Feature" as const,
          properties: { kind: "stop" },
          geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        })),
        ...(venue
          ? [
              {
                type: "Feature" as const,
                properties: { kind: "venue" },
                geometry: { type: "Point" as const, coordinates: [venue.lng, venue.lat] },
              },
            ]
          : []),
      ],
    },
  });
  map.addLayer({
    id: "stops",
    type: "circle",
    source: "stops",
    filter: ["==", ["get", "kind"], "stop"],
    paint: {
      "circle-radius": 5,
      "circle-color": "#ffffff",
      "circle-stroke-color": BRAND.ink,
      "circle-stroke-width": 2.5,
    },
  });
  map.addLayer({
    id: "venue",
    type: "circle",
    source: "stops",
    filter: ["==", ["get", "kind"], "venue"],
    paint: {
      "circle-radius": 8,
      "circle-color": BRAND.ink,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 3,
    },
  });

  const all = [
    ...features.flatMap((f) => f.geometry.coordinates),
    ...(venue ? [[venue.lng, venue.lat] as [number, number]] : []),
  ];
  if (all.length) {
    const lngs = all.map((c) => c[0]);
    const lats = all.map((c) => c[1]);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 48, duration: 0, pitch: 45, bearing: -12 },
    );
  }
}

export function RouteMap({
  legs,
  venue,
  label,
}: {
  legs: BoardLeg[];
  venue: { lat: number; lng: number } | null;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let map: MapLibreMap | null = null;
    let cancelled = false;
    (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        if (cancelled || !ref.current) return;
        // The worker is copied to public/ by scripts/vendor-maplibre.mjs (its own lookup fails once bundled).
        maplibre.setWorkerUrl(`/maplibre/${maplibre.getVersion()}/maplibre-gl-worker.mjs`);
        const m = new maplibre.Map({
          container: ref.current,
          style: STYLE,
          center: venue ? [venue.lng, venue.lat] : [0, 0],
          zoom: 13,
          pitch: 45,
          attributionControl: { compact: true },
          cooperativeGestures: true,
          // OpenFreeMap's style trips MapLibre's validator on three shield filters; it draws fine.
          validateStyle: false,
        });
        map = m;
        m.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        m.on("load", () => {
          restyle(m);
          drawRoute(m, legs, venue);
        });
        m.on("error", () => {});
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [legs, venue]);

  if (failed) {
    return (
      <p className="flex h-full items-center justify-center rounded-card bg-surface-sunken p-6 text-center text-sm text-text-muted">
        This map needs WebGL. The steps below show the same route.
      </p>
    );
  }
  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      className="h-full w-full overflow-hidden rounded-card bg-surface-sunken"
    />
  );
}
