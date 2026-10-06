import {
  BufferAttribute,
  BufferGeometry,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  WebGL3DRenderTarget,
  type WebGLRenderer,
} from "three";

/**
 * The tileable 3D noise the clouds are carved from, baked on the GPU at startup instead of
 * downloaded: R is Perlin-Worley (the cloud shapes), G, B and A are Worley fBm at three rising
 * frequencies (the billows that erode them). The technique follows Schneider's Nubis clouds
 * (GPU Pro 7) and Hillaire's TileableVolumeNoise.
 */

/** A triangle that covers the whole viewport; shared by every full-screen pass. */
export function fullscreenTriangle(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return g;
}

export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Loop bounds come from uniforms so ANGLE compiles real loops instead of unrolling hundreds of copies.
const GEN_FRAG = /* glsl */ `
uniform float uSlice;
uniform float uSize;
uniform int uRange;
uniform int uOctaves;
varying vec2 vUv;

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// Worley F1 on a lattice that wraps every "freq" cells; 1 at the feature points.
float worley(vec3 p, float freq) {
  vec3 q = p * freq;
  vec3 id = floor(q);
  vec3 f = q - id;
  float d = 1.0;
  for (int z = -uRange; z <= uRange; z++) {
    for (int y = -uRange; y <= uRange; y++) {
      for (int x = -uRange; x <= uRange; x++) {
        vec3 o = vec3(float(x), float(y), float(z));
        vec3 r = o + hash33(mod(id + o, freq)) - f;
        d = min(d, dot(r, r));
      }
    }
  }
  return 1.0 - sqrt(d);
}

vec3 grad3(vec3 cell) {
  return normalize(hash33(cell) * 2.0 - 1.0 + 1e-4);
}

// Gradient noise that wraps every "freq" cells, about -1 to 1.
float gnoise(vec3 p, float freq) {
  vec3 q = p * freq;
  vec3 i = floor(q);
  vec3 f = q - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(grad3(mod(i, freq)), f);
  float n100 = dot(grad3(mod(i + vec3(1.0, 0.0, 0.0), freq)), f - vec3(1.0, 0.0, 0.0));
  float n010 = dot(grad3(mod(i + vec3(0.0, 1.0, 0.0), freq)), f - vec3(0.0, 1.0, 0.0));
  float n110 = dot(grad3(mod(i + vec3(1.0, 1.0, 0.0), freq)), f - vec3(1.0, 1.0, 0.0));
  float n001 = dot(grad3(mod(i + vec3(0.0, 0.0, 1.0), freq)), f - vec3(0.0, 0.0, 1.0));
  float n101 = dot(grad3(mod(i + vec3(1.0, 0.0, 1.0), freq)), f - vec3(1.0, 0.0, 1.0));
  float n011 = dot(grad3(mod(i + vec3(0.0, 1.0, 1.0), freq)), f - vec3(0.0, 1.0, 1.0));
  float n111 = dot(grad3(mod(i + vec3(1.0, 1.0, 1.0), freq)), f - vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  ) * 1.6;
}

float perlinFbm(vec3 p, float freq) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < uOctaves; i++) {
    sum += amp * gnoise(p, freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return sum / norm;
}

float remap(float v, float l0, float h0, float l1, float h1) {
  return l1 + (v - l0) * (h1 - l1) / (h0 - l0);
}

void main() {
  vec3 p = vec3(vUv, (uSlice + 0.5) / uSize);
  float w4 = worley(p, 4.0);
  float w8 = worley(p, 8.0);
  float w16 = worley(p, 16.0);
  float w32 = worley(p, 32.0);
  float w64 = worley(p, 64.0);
  float perlin = clamp(perlinFbm(p, 4.0) * 0.5 + 0.5, 0.0, 1.0);
  float worleyFbm = w4 * 0.625 + w8 * 0.25 + w16 * 0.125;
  float perlinWorley = clamp(remap(perlin, 0.0, 1.0, worleyFbm, 1.0), 0.0, 1.0);
  float g = w8 * 0.625 + w16 * 0.25 + w32 * 0.125;
  float b = w16 * 0.625 + w32 * 0.25 + w64 * 0.125;
  float a = w32 * 0.75 + w64 * 0.25;
  gl_FragColor = vec4(perlinWorley, g, b, a);
}
`;

export interface NoiseVolume {
  target: WebGL3DRenderTarget;
  /** Bakes the volume a few slices per animation frame; resolves when every slice is drawn. */
  bake: (renderer: WebGLRenderer, slicesPerFrame?: number) => Promise<void>;
  dispose: () => void;
}

export function createNoiseVolume(size = 128): NoiseVolume {
  const target = new WebGL3DRenderTarget(size, size, size, {
    format: RGBAFormat,
    type: UnsignedByteType,
    depthBuffer: false,
    generateMipmaps: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
  });
  const texture = target.texture;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.wrapR = RepeatWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;

  const material = new ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: GEN_FRAG,
    uniforms: {
      uSlice: { value: 0 },
      uSize: { value: size },
      uRange: { value: 1 },
      uOctaves: { value: 5 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const geometry = fullscreenTriangle();
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new Scene();
  scene.add(mesh);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const bake = async (renderer: WebGLRenderer, slicesPerFrame = 16) => {
    await renderer.compileAsync(scene, camera);
    // Workers have requestAnimationFrame where they can draw to an OffscreenCanvas; else a timer.
    const nextFrame =
      typeof requestAnimationFrame === "function"
        ? (cb: () => void) => requestAnimationFrame(cb)
        : (cb: () => void) => setTimeout(cb, 16);
    let slice = 0;
    await new Promise<void>((resolve) => {
      const step = () => {
        const previous = renderer.getRenderTarget();
        const autoClear = renderer.autoClear;
        renderer.autoClear = false;
        for (let i = 0; i < slicesPerFrame && slice < size; i++, slice++) {
          material.uniforms.uSlice.value = slice;
          renderer.setRenderTarget(target, slice);
          renderer.render(scene, camera);
        }
        renderer.setRenderTarget(previous);
        renderer.autoClear = autoClear;
        if (slice < size) nextFrame(step);
        else resolve();
      };
      nextFrame(step);
    });
  };

  return {
    target,
    bake,
    dispose: () => {
      target.dispose();
      material.dispose();
      geometry.dispose();
    },
  };
}
