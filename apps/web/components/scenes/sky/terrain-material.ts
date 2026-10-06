import { ShaderMaterial, type Texture, Vector2, type Vector4 } from "three";
import { ATMOSPHERE_GLSL } from "./atmosphere";
import { COAST_DIR, TOWN } from "./world";

/**
 * The ground seen from about 3 km up: a coast with a town around a bay, a river mouth and a
 * headland, farmland and wooded hills inland, a calm sea that reflects the sky, shadows from
 * the cloud deck and haze that thickens with distance. Everything is procedural, so the scene
 * downloads no textures. Detail fades where a pixel covers more ground than the detail is
 * wide, and the town is supersampled, so nothing shimmers while the camera moves.
 */
const VERT = /* glsl */ `
uniform vec3 uCamPos;
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec2 d = wp.xz - uCamPos.xz;
  wp.y -= dot(d, d) / (2.0 * 6371000.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${ATMOSPHERE_GLSL}

uniform vec3 uCamPos;
uniform vec2 uTown;
// Cloud shadows baked at startup, and this frame's clouds (alpha is what still shows through).
uniform sampler2D uShadowMap;
uniform vec4 uShadowRect;
uniform sampler2D uClouds;
uniform vec2 uResolution;
uniform vec2 uCoastU;
// x: sun gain on the ground, y: sky gain on the ground
uniform vec2 uGroundLight;
varying vec3 vWorld;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p, int octaves) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    s += a * vnoise(p);
    p = ROT * p;
    a *= 0.5;
  }
  return s;
}

// Coastal coordinates around the bay: x along the shore (toward the far left), y inland.
vec2 coastal(vec2 p) {
  vec2 rel = p - uTown;
  vec2 n = vec2(-uCoastU.y, uCoastU.x);
  return vec2(dot(rel, uCoastU), dot(rel, n));
}

// How far inland the shoreline runs at a point along the coast.
float shoreLine(float along) {
  float bay = 1250.0 * exp(-pow(along / 2400.0, 2.0));
  float cape = 2300.0 * exp(-pow((along - 7400.0) / 2300.0, 2.0));
  float point = 800.0 * exp(-pow((along + 5600.0) / 1300.0, 2.0));
  float drift = (fbm(vec2(along / 8000.0, 3.7), 4) - 0.5) * 2600.0;
  float wiggle = (fbm(vec2(along / 1800.0, 9.1), 3) - 0.5) * 420.0;
  return bay - cape - point + drift + wiggle;
}

// Meters from the shore: positive on land, negative at sea. "line" is shoreLine(c.x).
float shore(vec2 p, vec2 c, float line) {
  float s = c.y - line;
  s += (fbm(p / 420.0 + 3.1, 3) - 0.5) * 120.0;
  // Two small islands off the headland.
  float isle = 260.0 - length((c - vec2(6200.0, -2900.0)) * vec2(1.0, 1.7));
  isle = max(isle, 150.0 - length(c - vec2(7600.0, -3300.0)));
  return max(s, isle + (fbm(p / 160.0, 2) - 0.5) * 120.0);
}

// The river: meets the bay just left of the town and winds inland.
float river(vec2 c, float coastDist, float footprint) {
  if (coastDist <= 0.0) return 0.0;
  float x = 700.0 + 300.0 * sin(c.y / 1100.0) + 150.0 * sin(c.y / 380.0 + 1.3);
  float width = 38.0 + min(c.y, 6000.0) * -0.004 + 30.0 * exp(-coastDist / 500.0);
  float d = abs(c.x - x) - width * 0.5;
  return 1.0 - smoothstep(-footprint * 0.5, footprint * 0.5 + 4.0, d);
}

float terrainHeight(vec2 p, float inland) {
  return (fbm(p / 3600.0 + 1.3, 3) * 520.0 + vnoise(p / 900.0) * 50.0) * inland;
}

vec3 landAlbedo(vec2 p, vec2 c, float footprint, float coastDist, float slope, float sunSide) {
  float region = fbm(p / 5200.0 + 1.7, 4);
  vec2 cellP = p / 300.0;
  vec2 ci = floor(cellP);
  vec2 cf = fract(cellP);
  float d1 = 8.0;
  float d2 = 8.0;
  vec2 best = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 r = o + hash22(ci + o) * 0.8 + 0.1 - cf;
      float d = max(abs(r.x), abs(r.y)) * 0.65 + length(r) * 0.35;
      if (d < d1) { d2 = d1; d1 = d; best = ci + o; }
      else if (d < d2) { d2 = d; }
    }
  }
  float r = hash12(best);
  // Late-summer farmland: golden stubble, green crops, pale dry grass, plowed earth.
  vec3 golden = vec3(0.3, 0.24, 0.13);
  vec3 crop = vec3(0.13, 0.16, 0.07);
  vec3 pale = vec3(0.34, 0.31, 0.22);
  vec3 earth = vec3(0.2, 0.15, 0.1);
  vec3 c0 = r < 0.34 ? golden : r < 0.62 ? crop : r < 0.84 ? pale : earth;
  c0 *= 0.86 + 0.28 * hash12(best + 17.0);
  vec3 avg = mix(vec3(0.24, 0.21, 0.13), vec3(0.2, 0.2, 0.12), region);
  float detail = 1.0 - smoothstep(60.0, 240.0, footprint);
  vec3 col = mix(avg, c0, detail);
  float hedge = 1.0 - smoothstep(0.0, 0.03 + footprint / 300.0, d2 - d1);
  col = mix(col, vec3(0.05, 0.07, 0.035), hedge * 0.55 * detail);
  // Woods on the hills and along the river; dry grass on sunny slopes.
  float woods = smoothstep(0.52, 0.64, fbm(p / 1700.0 + 23.0, 4) + slope * 0.9 - sunSide * 0.15);
  vec3 wood = vec3(0.045, 0.062, 0.032) * (0.85 + 0.3 * vnoise(p / 80.0));
  col = mix(col, wood, woods);
  col = mix(col, vec3(0.36, 0.3, 0.19), smoothstep(0.12, 0.3, slope) * sunSide * 0.5 * (1.0 - woods));
  // Scrub behind the beach, then pale sand at the water's edge.
  col = mix(vec3(0.27, 0.25, 0.18), col, smoothstep(80.0, 500.0, coastDist));
  float beach = 30.0 + 70.0 * exp(-pow(c.x / 2600.0, 2.0));
  col = mix(vec3(0.55, 0.5, 0.4), col, smoothstep(beach * 0.6, beach, coastDist));
  return col;
}

// The town: an urban mask, then blocks from a Voronoi pattern (small and dense in the old town
// by the bay, larger and greener outward), each with a building that casts a morning shadow.
float townMask(vec2 p, vec2 c, float coastDist) {
  float edge = fbm(p / 650.0 + 5.0, 3) - 0.5;
  vec2 q = (c - vec2(250.0, 1450.0)) / vec2(3500.0, 1650.0);
  float r = length(q) + edge * 0.6;
  return (1.0 - smoothstep(0.55, 1.0, r)) * smoothstep(25.0, 70.0, coastDist);
}

// Voronoi cell id and the distance to its border, in cell units.
vec3 cellOf(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  vec2 best = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 r = o + hash22(i + o) * 0.75 + 0.125 - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; best = i + o; }
      else if (d < d2) { d2 = d; }
    }
  }
  return vec3(best, (sqrt(d2) - sqrt(d1)) * 0.5);
}

vec4 townSample(vec2 c, vec2 sunC, float shadowLen, float urban, float old) {
  float size = mix(105.0, 58.0, old);
  // Blocks run slightly askew from district to district.
  float ang = (vnoise(c / 4200.0) - 0.5) * 0.3;
  mat2 R = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec2 g = R * c / vec2(size, size * 1.2);
  vec3 cell = cellOf(g);
  float h = hash12(cell.xy);
  float lot = 0.13;
  // Toward the edge of town, fewer lots are built on.
  bool built = hash12(cell.xy + 9.7) < smoothstep(0.05, 0.75, urban);
  float inside = built && cell.z > lot ? 1.0 : 0.0;
  float height = mix(5.5, 12.0, hash12(cell.xy + 3.1)) * mix(1.0, 1.7, old);
  vec3 sc = cellOf(R * (c + sunC * height * shadowLen) / vec2(size, size * 1.2));
  bool sbuilt = hash12(sc.xy + 9.7) < smoothstep(0.05, 0.75, urban);
  float shaded = (sbuilt && sc.z > lot && inside < 0.5) ? 1.0 : 0.0;
  vec3 roof = h < 0.34 ? vec3(0.62, 0.6, 0.56) : h < 0.6 ? vec3(0.5, 0.3, 0.2) : h < 0.82 ? vec3(0.54, 0.51, 0.46) : vec3(0.4, 0.4, 0.39);
  float leafy = vnoise(c / 35.0) * (1.0 - old * 0.7);
  vec3 yard = mix(vec3(0.3, 0.29, 0.27), vec3(0.07, 0.1, 0.05), smoothstep(0.35, 0.7, leafy));
  float street = 1.0 - smoothstep(0.03, 0.06, cell.z);
  vec3 col = mix(yard, vec3(0.28, 0.28, 0.29), street);
  col = mix(col, roof, inside);
  if (hash12(cell.xy * 1.37 + 4.1) > 0.96) col = vec3(0.08, 0.12, 0.05);
  return vec4(col, shaded > 0.5 ? 0.28 : 1.0);
}

vec4 townColor(vec2 c, vec2 sunC, float shadowLen, float urban, float old, vec2 cdx, vec2 cdy) {
  // Four taps on a rotated grid, about a pixel apart.
  vec2 dx = cdx * 0.5;
  vec2 dy = cdy * 0.5;
  vec4 s = townSample(c + dx * 0.375 + dy * 0.125, sunC, shadowLen, urban, old);
  s += townSample(c - dx * 0.125 + dy * 0.375, sunC, shadowLen, urban, old);
  s += townSample(c - dx * 0.375 - dy * 0.125, sunC, shadowLen, urban, old);
  s += townSample(c + dx * 0.125 - dy * 0.375, sunC, shadowLen, urban, old);
  return s * 0.25;
}

float cloudShadow(vec2 p) {
  vec2 uv = (p - uShadowRect.xy) * uShadowRect.zw;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 1.0;
  return mix(0.25, 1.0, textureLod(uShadowMap, uv, 0.0).r);
}

void main() {
  vec2 p = vWorld.xz;
  vec3 toP = vWorld - uCamPos;
  float dist = length(toP);
  vec3 rd = toP / dist;
  vec2 c = coastal(p);
  vec2 cdx = dFdx(c);
  vec2 cdy = dFdy(c);
  float footprint = length(fwidth(p));
  // Under thick cloud the ground cannot be seen: skip it, with a color close to what is there.
  if (texture2D(uClouds, gl_FragCoord.xy / uResolution).a < 0.01) {
    gl_FragColor = vec4(applyHaze(vec3(0.03, 0.045, 0.055), rd, uCamPos.y, 0.0, dist), 1.0);
    return;
  }
  float line = shoreLine(c.x);
  float coastDist = shore(p, c, line);
  float shadow = cloudShadow(p);
  vec3 sunIrr = uSunIrr * uGroundLight.x;
  vec3 skyIrr = uSkyIrr * uGroundLight.y;
  vec3 color;
  float wet = river(c, coastDist, footprint);
  if (coastDist > 0.0 && wet < 0.999) {
    // Relief from the height field, for shading only.
    float e = 50.0;
    float inland = smoothstep(900.0, 6500.0, coastDist);
    float h0 = terrainHeight(p, inland);
    float hx = terrainHeight(p + vec2(e, 0.0), inland);
    float hz = terrainHeight(p + vec2(0.0, e), inland);
    vec3 N = normalize(vec3(h0 - hx, e, h0 - hz));
    float slope = 1.0 - N.y;
    float ndl = max(dot(N, uSunDir), 0.0);
    float sunSide = clamp(dot(normalize(N.xz + 1e-5), normalize(uSunDir.xz)) * 0.5 + 0.5, 0.0, 1.0);
    vec3 albedo = landAlbedo(p, c, footprint, coastDist, slope * 6.0, sunSide);
    float urban = townMask(p, c, coastDist);
    float lit = 1.0;
    if (urban > 0.001) {
      vec2 sunC = vec2(dot(uSunDir.xz, uCoastU), dot(uSunDir.xz, vec2(-uCoastU.y, uCoastU.x)));
      sunC /= max(length(sunC), 1e-4);
      float shadowLen = sqrt(1.0 - uSunDir.y * uSunDir.y) / uSunDir.y;
      // Old town: within a kilometer of the bay's shore, around its middle.
      float old = (1.0 - smoothstep(500.0, 1500.0, coastDist)) * (1.0 - smoothstep(1200.0, 2600.0, abs(c.x - 300.0)));
      vec4 t = townColor(c, sunC, shadowLen, urban, old, cdx, cdy);
      float detail = 1.0 - smoothstep(60.0, 220.0, footprint);
      vec3 townCol = mix(vec3(0.42, 0.4, 0.36), t.rgb, detail);
      float mixAmt = smoothstep(0.0, 0.35, urban);
      albedo = mix(albedo, townCol, mixAmt);
      lit = mix(1.0, mix(0.75, t.a, detail), mixAmt);
    }
    // The coast road, a pale line a little way back from the beach.
    float road = 1.0 - smoothstep(6.0, 9.0 + footprint * 0.5, abs(coastDist - 190.0 - 60.0 * sin(c.x / 900.0)));
    albedo = mix(albedo, vec3(0.34, 0.33, 0.32), road * (1.0 - smoothstep(80.0, 300.0, footprint)) * 0.8);
    vec3 land = albedo / PI * (sunIrr * ndl * shadow * lit + skyIrr * mix(0.7, 1.0, shadow));
    color = land;
  }
  if (coastDist <= 0.0 || wet > 0.001) {
    float depth = clamp(-coastDist / 1100.0, 0.0, 1.0);
    vec3 body = mix(vec3(0.05, 0.14, 0.13), vec3(0.012, 0.045, 0.068), smoothstep(0.0, 1.0, depth));
    body = mix(body, vec3(0.04, 0.08, 0.06), wet);
    // Ripples and wind slicks, too small to see one by one, change how the sea reflects.
    vec2 g = vec2(fbm(p / 260.0, 3) - fbm(p / 260.0 + vec2(0.13, 0.0), 3), fbm(p / 260.0 + 4.0, 3) - fbm(p / 260.0 + vec2(4.0, 0.13), 3));
    float slick = fbm(p / 1500.0 + 2.0, 3);
    vec3 N = normalize(vec3(g.x * 0.08, 1.0, g.y * 0.08));
    float rough = mix(0.006, 0.02, slick);
    float cosI = clamp(dot(-rd, N), 0.02, 1.0);
    float F = 0.02 + 0.98 * pow(1.0 - cosI, 5.0);
    vec3 refl = reflect(rd, N);
    vec3 skyRef = skyRadiance(normalize(vec3(refl.x, max(refl.y, 0.015), refl.z)));
    vec3 hv = normalize(uSunDir - rd);
    float nh = max(dot(hv, N), 1e-3);
    float tan2 = (1.0 - nh * nh) / (nh * nh);
    float D = exp(-tan2 / rough) / (PI * rough * nh * nh * nh * nh);
    float glint = D * F / (4.0 * cosI * max(uSunDir.y, 0.05));
    vec3 water = body / PI * (sunIrr * uSunDir.y * shadow + skyIrr);
    vec3 sea = water * (1.0 - F) + skyRef * F * mix(0.82, 1.0, shadow) + uSunIrr * glint * shadow * 0.5;
    // Surf where waves meet the beach.
    float surf = (1.0 - smoothstep(0.0, 18.0 + footprint, -coastDist)) * 0.45 * (1.0 - wet);
    sea = mix(sea, (sunIrr * uSunDir.y + skyIrr) * 0.12, surf);
    color = coastDist <= 0.0 ? sea : mix(color, sea, wet);
  }
  color = applyHaze(color, rd, uCamPos.y, 0.0, dist);
  gl_FragColor = vec4(color, 1.0);
}
`;

export function createTerrainMaterial(
  shared: Record<string, { value: unknown }>,
  shadowMap: Texture,
  shadowRect: Vector4,
) {
  return new ShaderMaterial({
    name: "SkyGround",
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      ...shared,
      uTown: { value: new Vector2(TOWN.x, TOWN.z) },
      uCoastU: { value: COAST_DIR.clone() },
      uGroundLight: { value: new Vector2(1.9, 0.5) },
      uShadowMap: { value: shadowMap },
      uShadowRect: { value: shadowRect },
      uClouds: { value: null },
      uResolution: { value: new Vector2(1, 1) },
    },
  });
}
