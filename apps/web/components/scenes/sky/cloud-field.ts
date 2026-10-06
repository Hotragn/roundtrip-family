import { Vector2, Vector4 } from "three";
import { CLEARINGS, CLOUD_SEEDS, CLOUDS } from "./world";

/**
 * The cumulus deck as a density field, shared by the raymarched clouds and by the ground's
 * cloud shadows. A weather map decides where clouds may grow; Perlin-Worley noise gives each
 * one its shape, with flat bases and rounded tops; finer Worley billows erode the edges.
 */
export const CLOUD_FIELD_GLSL = /* glsl */ `
uniform highp sampler3D uNoise;
uniform float uCloudBase;
uniform float uCloudTop;
uniform vec2 uWind;
uniform vec3 uCamPos;
uniform vec4 uClearA[3];
uniform vec2 uClearB[3];
uniform vec4 uSeeds[2];
// x: shape tile (m), y: detail tile (m), z: erosion, w: edge softness
uniform vec4 uShape;
// x, y: the weather values that ramp from clear to full coverage; z: weather tile (m); w: threshold at full coverage
uniform vec4 uWeather;
// The weather baked into a 2D map at startup: the deck never changes, so it is computed once.
uniform sampler2D uWeatherMap;
// x, z of the map's corner, then 1 / its width and depth (m)
uniform vec4 uWeatherRect;

const float EARTH_R = 6371000.0;

float remap(float v, float l0, float h0, float l1, float h1) {
  return l1 + (v - l0) * (h1 - l1) / (h0 - l0);
}
float remap01(float v, float lo, float hi) {
  return clamp((v - lo) / (hi - lo), 0.0, 1.0);
}

// Height above the curved ground, measured from the camera's nadir.
float curvedHeight(vec3 p) {
  vec2 d = p.xz - uCamPos.xz;
  return p.y + dot(d, d) / (2.0 * EARTH_R);
}

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float weatherRaw(vec2 xz) {
  // Low frequencies only: fine detail here would be extruded up the deck as vertical folds.
  vec2 q = (xz + uWind) / uWeather.z;
  float n = textureLod(uNoise, vec3(q.x, 0.31, q.y), 0.0).r;
  float m = textureLod(uNoise, vec3(q.x * 1.9 + 0.17, 0.73, q.y * 1.9 + 0.41), 0.0).r;
  float cov = remap01(n * 0.65 + m * 0.35, uWeather.x, uWeather.y);
  // Clearings with ragged, natural edges.
  float ragged = (m - 0.5) * 1.1 + (n - 0.5) * 0.5;
  for (int i = 0; i < 3; i++) {
    float d = segDist(xz, uClearA[i].xy, uClearA[i].zw) / uClearB[i].x + ragged;
    cov *= 1.0 - uClearB[i].y * (1.0 - smoothstep(0.3, 1.0, d));
  }
  for (int i = 0; i < 2; i++) {
    float s = length(xz - uSeeds[i].xy) / uSeeds[i].z + ragged * 0.35;
    cov = max(cov, uSeeds[i].w * (1.0 - smoothstep(0.3, 1.0, s)));
  }
  return cov;
}

float weather(vec2 xz) {
  return textureLod(uWeatherMap, (xz - uWeatherRect.xy) * uWeatherRect.zw, 0.0).r;
}

// Fraction of the way from the deck's base to its top, or outside 0..1.
float deckHeight(vec3 p) {
  return (curvedHeight(p) - uCloudBase) / (uCloudTop - uCloudBase);
}

float cloudDensity(vec3 p, float h, float detail) {
  if (h <= 0.0 || h >= 1.0) return 0.0;
  float cov = weather(p.xz);
  if (cov < 0.01) return 0.0;
  vec3 wind = vec3(uWind.x, 0.0, uWind.y);
  vec4 n = textureLod(uNoise, (p + wind) / uShape.x, 0.0);
  float lowFbm = n.g * 0.625 + n.b * 0.25 + n.a * 0.125;
  float shape = remap(n.r, lowFbm - 1.0, 1.0, 0.0, 1.0);
  // Each cloud is a dome on a flat base, taller where the weather allows more cloud, so the
  // edges of a cloudy patch taper into small puffs instead of standing as walls.
  float hh = h / mix(0.22, 1.0, cov);
  float dome = clamp(1.0 - hh * hh, 0.0, 1.0);
  float field = shape * remap01(h, 0.0, 0.06) * dome;
  float threshold = mix(1.0, uWeather.w, cov);
  float base = remap01(field, threshold, threshold + uShape.w);
  if (detail <= 0.0 || base <= 0.0) return base;
  vec4 dn = textureLod(uNoise, (p + wind * 1.6) / uShape.y, 0.0);
  float hi = dn.g * 0.7 + dn.b * 0.3;
  // Wispy near the base, billowy toward the top.
  float erode = mix(1.0 - hi, hi, remap01(h, 0.1, 0.6));
  return clamp(remap(base, erode * uShape.z * detail, 1.0, 0.0, 1.0), 0.0, 1.0);
}
`;

export function cloudFieldUniforms() {
  return {
    uCloudBase: { value: CLOUDS.base },
    uCloudTop: { value: CLOUDS.top },
    uWind: { value: CLOUDS.wind.clone() },
    uShape: { value: new Vector4(...CLOUDS.shape) },
    uWeather: { value: new Vector4(...CLOUDS.weather) },
    uClearA: { value: CLEARINGS.map((c) => new Vector4(c.a[0], c.a[1], c.b[0], c.b[1])) },
    uClearB: { value: CLEARINGS.map((c) => new Vector2(c.radius, c.strength)) },
    uSeeds: {
      value: CLOUD_SEEDS.map((s) => new Vector4(s.center[0], s.center[1], s.radius, s.strength)),
    },
  };
}
