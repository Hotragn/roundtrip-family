import { Matrix4, ShaderMaterial, Vector3, Vector4 } from "three";
import { ATMOSPHERE_GLSL } from "./atmosphere";
import { CLOUD_FIELD_GLSL } from "./cloud-field";
import { FULLSCREEN_VERT } from "./noise-volume";

/**
 * Raymarched volumetric clouds. Each pixel marches its view ray through the curved deck,
 * lights every sample with a short march toward the sun (Beer's law, a two-lobe phase and
 * Wrenninge's multiple-scattering octaves) plus sky and ground ambient, and fades into the
 * haze with distance. Output is premultiplied: rgb is the light the clouds add, alpha is how
 * much of what lies behind still shows through.
 */
const FRAG = /* glsl */ `
${ATMOSPHERE_GLSL}
${CLOUD_FIELD_GLSL}

uniform mat4 uInvViewProj;
uniform float uFrame;
uniform int uSteps;
uniform float uMaxDist;
uniform float uDensityScale;
uniform float uLightAbsorb;
uniform vec3 uAmbTop;
uniform vec3 uAmbBottom;
// x: optical depth falloff per octave, y: contribution per octave, z: anisotropy per octave, w: sun gain
uniform vec4 uScatter;
// Light that has scattered many times inside a cloud, barely dimmed with depth.
uniform float uInner;
varying vec2 vUv;

float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

bool solveQuad(float a, float b, float c, out float t0, out float t1) {
  float disc = b * b - 4.0 * a * c;
  if (disc < 0.0) return false;
  float q = -0.5 * (b + (b >= 0.0 ? 1.0 : -1.0) * sqrt(disc));
  float r0 = q / a;
  float r1 = abs(q) > 1e-9 ? c / q : r0;
  t0 = min(r0, r1);
  t1 = max(r0, r1);
  return true;
}

// The first stretch of the ray inside the curved deck.
vec2 deckSegment(vec3 ro, vec3 rd) {
  float a = max(dot(rd.xz, rd.xz), 1e-6) / (2.0 * EARTH_R);
  float b = rd.y;
  float c = ro.y;
  float t0, t1, s0, s1;
  if (!solveQuad(a, b, c - uCloudTop, t0, t1)) return vec2(-1.0);
  float start = max(t0, 0.0);
  float end = min(t1, uMaxDist);
  if (end <= start) return vec2(-1.0);
  if (solveQuad(a, b, c - uCloudBase, s0, s1)) {
    if (s0 > start) end = min(end, s0);
    else if (s1 > start) start = max(start, s1);
  }
  return end > start ? vec2(start, end) : vec2(-1.0);
}

float phase2(float c, float k) {
  return mix(hgPhase(c, 0.72 * k), hgPhase(c, -0.22 * k), 0.28) * 4.0 * PI;
}

float lightDepth(vec3 p) {
  float od = 0.0;
  float stepL = 36.0;
  float t = stepL * 0.5;
  for (int j = 0; j < 5; j++) {
    vec3 q = p + uSunDir * t;
    od += cloudDensity(q, deckHeight(q), 0.0) * stepL;
    t += stepL;
    stepL *= 1.9;
  }
  return od * uDensityScale * uLightAbsorb;
}

void main() {
  vec4 farP = uInvViewProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize(farP.xyz / farP.w - uCamPos);
  vec3 ro = uCamPos;
  vec2 seg = deckSegment(ro, rd);
  if (seg.y <= seg.x) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float len = seg.y - seg.x;
  // From inside the deck, steps start small and grow with distance; from outside, they are even.
  bool inside = seg.x <= 0.0;
  float jitter = ign(gl_FragCoord.xy + uFrame * 5.588238);
  float n = float(uSteps);
  float ds = max(len / n, 12.0);
  float t = inside ? len * pow(jitter / n, 2.0) : seg.x + ds * jitter;
  float cosT = dot(rd, uSunDir);
  vec3 scat = vec3(0.0);
  float T = 1.0;
  float tSum = 0.0;
  float wSum = 0.0;
  for (int i = 0; i < 400; i++) {
    if (i >= uSteps || t > seg.y || T < 0.012) break;
    if (inside) {
      float t1 = len * pow((float(i) + 1.0 + jitter) / n, 2.0);
      ds = max(t1 - t, 1.0);
    }
    vec3 p = ro + rd * t;
    float h = deckHeight(p);
    // Billows only where they are bigger than a pixel; far clouds keep their soft shapes.
    float dens = cloudDensity(p, h, 1.0 - smoothstep(9000.0, 26000.0, t));
    if (dens > 0.0004) {
      float sigma = dens * uDensityScale;
      float od = lightDepth(p);
      float ms = 0.0;
      float a = 1.0;
      float b = 1.0;
      float k = 1.0;
      for (int o = 0; o < 4; o++) {
        ms += b * exp(-od * a) * phase2(cosT, k);
        a *= uScatter.x;
        b *= uScatter.y;
        k *= uScatter.z;
      }
      vec3 amb = mix(uAmbBottom, uAmbTop, smoothstep(0.0, 1.0, h));
      vec3 S = uSunIrr * (ms * ONE_OVER_FOURPI * uScatter.w + uInner * exp(-od * 0.03)) + amb;
      float Tr = exp(-sigma * ds);
      float absorbed = T * (1.0 - Tr);
      scat += S * absorbed;
      tSum += absorbed * t;
      wSum += absorbed;
      T *= Tr;
    }
    t += ds;
  }
  float tMean = wSum > 0.0 ? tSum / wSum : seg.x;
  float hMean = ro.y + rd.y * tMean;
  float Th = exp(-hazeDepth(ro.y, hMean, tMean));
  scat = scat * Th + hazeColor(rd) * (1.0 - T) * (1.0 - Th);
  gl_FragColor = vec4(scat, T);
}
`;

export function createCloudsMaterial(shared: Record<string, { value: unknown }>) {
  return new ShaderMaterial({
    name: "SkyClouds",
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: FRAG,
    uniforms: {
      ...shared,
      uInvViewProj: { value: new Matrix4() },
      uFrame: { value: 0 },
      uSteps: { value: 64 },
      uMaxDist: { value: 70000 },
      uAmbTop: { value: new Vector3() },
      uAmbBottom: { value: new Vector3() },
      uScatter: { value: new Vector4(0.3, 0.7, 0.5, 1.6) },
      uInner: { value: 0.05 },
    },
    depthTest: false,
    depthWrite: false,
  });
}
