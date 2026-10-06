import { Vector3 } from "three";

/**
 * The Preetham daylight model, as three.js's Sky addon (three/examples/jsm/objects/Sky.js)
 * computes it. The Sky mesh draws the sky itself; the same math, ported here, lights the clouds
 * and the ground and colors the haze, so every part of the scene agrees with the sky behind it.
 */

export interface SkySettings {
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  /** Sun elevation above the horizon, degrees. */
  elevation: number;
  /** Sun azimuth, degrees clockwise from the camera's forward direction (-z) toward +x. */
  azimuth: number;
}

// Constants from Sky.js (vertex stage).
const TOTAL_RAYLEIGH = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5] as const;
const MIE_CONST = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14] as const;
const CUTOFF_ANGLE = 1.6110731556870734;
const STEEPNESS = 1.5;
const EE = 1000;

export function sunDirection(s: Pick<SkySettings, "elevation" | "azimuth">): Vector3 {
  const el = (s.elevation * Math.PI) / 180;
  const az = (s.azimuth * Math.PI) / 180;
  return new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

export interface SkyConstants {
  sunDir: Vector3;
  sunE: number;
  betaR: Vector3;
  betaM: Vector3;
  mieG: number;
}

export function skyConstants(s: SkySettings): SkyConstants {
  const sunDir = sunDirection(s);
  const zenithCos = Math.min(1, Math.max(-1, sunDir.y));
  const sunE = EE * Math.max(0, 1 - Math.exp(-((CUTOFF_ANGLE - Math.acos(zenithCos)) / STEEPNESS)));
  // Sky.js fades Rayleigh with sunPosition.y / 450000; with a unit sun vector that is 1.
  const sunfade = 1 - Math.min(1, Math.max(0, 1 - Math.exp(sunDir.y / 450000)));
  const rayleighCoefficient = s.rayleigh - (1 - sunfade);
  const betaR = new Vector3(...TOTAL_RAYLEIGH).multiplyScalar(rayleighCoefficient);
  const c = 0.2 * s.turbidity * 10e-18;
  // biome-ignore lint/suspicious/noApproximativeNumericConstant: Sky.js's own constant, kept exactly as it is there
  const betaM = new Vector3(...MIE_CONST).multiplyScalar(0.434 * c * s.mieCoefficient);
  return { sunDir, sunE, betaR, betaM, mieG: s.mieDirectionalG };
}

const THREE_OVER_SIXTEENPI = 0.05968310365946075;
const ONE_OVER_FOURPI = 0.07957747154594767;

function hg(cosTheta: number, g: number) {
  const g2 = g * g;
  return ONE_OVER_FOURPI * ((1 - g2) / (1 - 2 * g * cosTheta + g2) ** 1.5);
}

function extinction(k: SkyConstants, dirY: number): Vector3 {
  const zenithAngle = Math.acos(Math.max(0, dirY));
  const inverse = 1 / (Math.cos(zenithAngle) + 0.15 * (93.885 - (zenithAngle * 180) / Math.PI) ** -1.253);
  const sR = 8.4e3 * inverse;
  const sM = 1.25e3 * inverse;
  return new Vector3(
    Math.exp(-(k.betaR.x * sR + k.betaM.x * sM)),
    Math.exp(-(k.betaR.y * sR + k.betaM.y * sM)),
    Math.exp(-(k.betaR.z * sR + k.betaM.z * sM)),
  );
}

/** Sky radiance in a direction: the Sky shader's color without the sun disc or its 2D clouds. */
export function skyRadiance(k: SkyConstants, dir: Vector3): Vector3 {
  const fex = extinction(k, dir.y);
  const cosTheta = dir.dot(k.sunDir);
  const rPhase = THREE_OVER_SIXTEENPI * (1 + (cosTheta * 0.5 + 0.5) ** 2);
  const mPhase = hg(cosTheta, k.mieG);
  const out = new Vector3();
  const sunFade = Math.min(1, Math.max(0, (1 - k.sunDir.y) ** 5));
  for (const ch of ["x", "y", "z"] as const) {
    const ratio = (k.betaR[ch] * rPhase + k.betaM[ch] * mPhase) / (k.betaR[ch] + k.betaM[ch]);
    let lin = (k.sunE * ratio * (1 - fex[ch])) ** 1.5;
    lin *= 1 + ((k.sunE * ratio * fex[ch]) ** 0.5 - 1) * sunFade;
    const l0 = 0.1 * fex[ch];
    out[ch] = (lin + l0) * 0.04;
  }
  out.y += 0.0003;
  out.z += 0.00075;
  return out;
}

/** Sunlight arriving through the atmosphere, in the same units as the sky radiance. */
export function sunIrradiance(k: SkyConstants): Vector3 {
  return extinction(k, k.sunDir.y).multiplyScalar(k.sunE * 0.04);
}

/** Cosine-weighted average of the upper sky: the light a flat surface gets from the sky. */
export function skyIrradiance(k: SkyConstants): Vector3 {
  const sum = new Vector3();
  let weight = 0;
  const d = new Vector3();
  for (let i = 0; i < 6; i++) {
    const el = ((i + 0.5) / 6) * (Math.PI / 2);
    for (let j = 0; j < 12; j++) {
      const az = (j / 12) * Math.PI * 2;
      d.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
      const w = Math.sin(el) * Math.cos(el);
      sum.addScaledVector(skyRadiance(k, d), w);
      weight += w;
    }
  }
  // Irradiance of a uniform hemisphere is pi times its radiance.
  return sum.multiplyScalar(Math.PI / weight);
}

/** GLSL: the same sky radiance, for the ground, the clouds and the haze. */
export const ATMOSPHERE_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uBetaR;
uniform vec3 uBetaM;
uniform float uSunE;
uniform float uMieG;
uniform vec3 uSunIrr;
uniform vec3 uSkyIrr;
uniform float uHazeDensity;
uniform float uHazeHeight;

#ifndef PI
#define PI 3.141592653589793
#endif
const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
const float ONE_OVER_FOURPI = 0.07957747154594767;

float hgPhase(float cosTheta, float g) {
  float g2 = g * g;
  return ONE_OVER_FOURPI * ((1.0 - g2) / pow(max(1.0 - 2.0 * g * cosTheta + g2, 1e-4), 1.5));
}

vec3 skyExtinction(float dirY) {
  float zenithAngle = acos(max(0.0, dirY));
  float inverse = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / PI), -1.253));
  return exp(-(uBetaR * (8.4E3 * inverse) + uBetaM * (1.25E3 * inverse)));
}

vec3 skyRadiance(vec3 direction) {
  vec3 Fex = skyExtinction(direction.y);
  float cosTheta = dot(direction, uSunDir);
  float rPhase = THREE_OVER_SIXTEENPI * (1.0 + pow(cosTheta * 0.5 + 0.5, 2.0));
  vec3 betaRTheta = uBetaR * rPhase;
  vec3 betaMTheta = uBetaM * hgPhase(cosTheta, uMieG);
  vec3 ratio = (betaRTheta + betaMTheta) / (uBetaR + uBetaM);
  vec3 Lin = pow(uSunE * ratio * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(uSunE * ratio * Fex, vec3(0.5)), clamp(pow(1.0 - uSunDir.y, 5.0), 0.0, 1.0));
  vec3 L0 = vec3(0.1) * Fex;
  return (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);
}

// Aerial perspective: an exponential haze layer. Optical depth between two heights over a distance.
float hazeDepth(float h0, float h1, float dist) {
  float H = uHazeHeight;
  float e0 = exp(-max(h0, 0.0) / H);
  float e1 = exp(-max(h1, 0.0) / H);
  float dh = h1 - h0;
  float avg = abs(dh) < 1.0 ? e0 : H * (e0 - e1) / dh;
  return uHazeDensity * avg * dist;
}

// The color of the haze along a view ray: the horizon sky in that direction, brighter toward the sun.
vec3 hazeColor(vec3 rd) {
  vec3 dir = normalize(vec3(rd.x, max(rd.y, 0.0) * 0.35 + 0.004, rd.z));
  vec3 c = skyRadiance(dir);
  // Morning haze reads as a soft blue-white, not the sky's cyan: keep some of its color.
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(lum), c, 0.62) * vec3(1.0, 0.99, 1.02);
  c += uSunIrr * hgPhase(dot(rd, uSunDir), 0.7) * 0.16;
  return c;
}

vec3 applyHaze(vec3 color, vec3 rd, float h0, float h1, float dist) {
  float T = exp(-hazeDepth(h0, h1, dist));
  return color * T + hazeColor(rd) * (1.0 - T);
}
`;
