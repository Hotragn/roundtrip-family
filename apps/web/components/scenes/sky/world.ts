import { Vector2, Vector3 } from "three";
import type { SkySettings } from "./atmosphere";

/**
 * The landing sky's world, in meters, y up, the camera looking toward -z. A fair-weather
 * cumulus deck sits between 1.25 and 2.45 km; a coastal town lies 11 km ahead and a little to
 * the right, with the sea beyond it and a low morning sun off to the right.
 */

export const SKY: SkySettings = {
  turbidity: 2.4,
  rayleigh: 1.25,
  mieCoefficient: 0.0042,
  mieDirectionalG: 0.82,
  elevation: 17,
  azimuth: 58,
};

export const CLOUDS = {
  base: 1250,
  top: 2450,
  /** Extinction per meter at full density. */
  density: 0.045,
  /** How much less the light toward the sun is absorbed: keeps the deck light and soft. */
  lightAbsorb: 0.75,
  wind: new Vector2(1800, -900),
  /** Shape tile (m), detail tile (m), erosion, edge softness. */
  shape: [3600, 1200, 0.45, 0.1] as [number, number, number, number],
  /** Weather ramp from clear to full coverage, weather tile (m), shape threshold at full coverage. */
  weather: [0.66, 0.84, 14000, 0.42] as [number, number, number, number],
};

export const HAZE = { density: 1 / 30000, height: 1600 };

export const TOWN = new Vector3(2400, 0, -8600);
/** Along the coast, from the near right toward the far left. */
export const COAST_DIR = new Vector2(-0.62, -0.785).normalize();

/**
 * Keyframes: the intro rises from inside a cloud to the hold, and scrolling keeps climbing.
 * The camera always keeps the town framed; the tilt is added to that, in degrees.
 */
export const CAMERA = {
  start: { pos: new Vector3(0, 1900, 520), tilt: 6 },
  hold: { pos: new Vector3(0, 2980, 0), tilt: 0 },
  top: { pos: new Vector3(0, 4300, -900), tilt: 5 },
};

/**
 * Holes cut in the deck so the coast shows through: a capsule from (ax, az) to (bx, bz) with a
 * radius and a strength. The first follows the line of sight from the hold to the town.
 */
export const CLEARINGS: Array<{ a: [number, number]; b: [number, number]; radius: number; strength: number }> = [
  { a: [1100, -3600], b: [1800, -6400], radius: 1900, strength: 0.8 },
  { a: [1800, -6600], b: [3300, -11000], radius: 3600, strength: 0.75 },
  { a: [-3400, -4600], b: [-5600, -9000], radius: 2200, strength: 0.45 },
];

/** A cloud placed where the intro starts, so the climb begins inside one. */
export const CLOUD_SEEDS: Array<{ center: [number, number]; radius: number; strength: number }> = [
  { center: [0, 520], radius: 1700, strength: 1 },
  // Fills the near field that tall phone screens look down into.
  { center: [-200, -1900], radius: 1500, strength: 0.75 },
];

/** The flight path: a cubic Bezier from above the deck down to the town. */
export const FLIGHT = {
  p0: new Vector3(-1900, 3080, -2600),
  p1: new Vector3(-400, 3620, -4800),
  p2: new Vector3(1700, 2400, -6900),
  p3: new Vector3(TOWN.x + 120, 40, TOWN.z + 200),
};

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Framing for the viewport's shape. Wide screens put the town in the right third, beside the
 * headline panel; tall phone screens center it above the panel and widen the lens.
 */
export function framing(aspect: number) {
  const t = smoothstep(0.5, 1.7, aspect);
  return {
    fov: lerp(64, 40, t),
    /** Screen position of the town, as a fraction of the width and of the height from the top. */
    subjectX: lerp(0.52, 0.72, t),
    subjectY: lerp(0.47, 0.68, t),
  };
}

/**
 * Calm, physical easing for the climb: it starts gently while the canvas fades in, climbs
 * steadily through the cloud tops, and settles over the last second and a half. No overshoot.
 */
export function settle(t: number) {
  const x = Math.min(1, Math.max(0, t));
  const s = x * x * (3 - 2 * x);
  return 1 - (1 - s) ** 1.6;
}
