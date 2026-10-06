import {
  LinearFilter,
  Mesh,
  type OrthographicCamera,
  RedFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector4,
  type WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { CLOUD_FIELD_GLSL } from "./cloud-field";
import { FULLSCREEN_VERT, fullscreenTriangle } from "./noise-volume";

/**
 * The deck does not move, so two things are computed once at startup instead of for every
 * pixel of every frame: the weather map (where clouds may grow, with the clearings over the
 * coast) and the shadows the clouds cast on the ground under the low sun.
 */

// x0, z0, width, depth in meters
const WEATHER_AREA = [-72000, -98000, 144000, 106000] as const;
const SHADOW_AREA = [-24000, -52000, 56000, 58000] as const;

const rect = (a: readonly [number, number, number, number]) => new Vector4(a[0], a[1], 1 / a[2], 1 / a[3]);

function target(width: number, height: number) {
  return new WebGLRenderTarget(width, height, {
    format: RedFormat,
    type: UnsignedByteType,
    depthBuffer: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: false,
  });
}

export function createFieldMaps(shared: Record<string, { value: unknown }>) {
  const weather = target(2048, 1536);
  const shadow = target(1024, 1024);
  const weatherRect = rect(WEATHER_AREA);
  const shadowRect = rect(SHADOW_AREA);

  const weatherMaterial = new ShaderMaterial({
    name: "SkyWeatherBake",
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: /* glsl */ `
      ${CLOUD_FIELD_GLSL}
      uniform vec4 uArea;
      varying vec2 vUv;
      void main() {
        gl_FragColor = vec4(weatherRaw(uArea.xy + vUv * uArea.zw));
      }
    `,
    uniforms: { ...shared, uArea: { value: new Vector4(...WEATHER_AREA) } },
    depthTest: false,
    depthWrite: false,
  });

  const shadowMaterial = new ShaderMaterial({
    name: "SkyShadowBake",
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: /* glsl */ `
      ${CLOUD_FIELD_GLSL}
      uniform vec3 uSunDir;
      uniform float uDensityScale;
      uniform vec4 uArea;
      varying vec2 vUv;
      void main() {
        vec2 xz = uArea.xy + vUv * uArea.zw;
        float thick = uCloudTop - uCloudBase;
        float od = 0.0;
        for (int k = 0; k < 8; k++) {
          float y = uCloudBase + thick * (float(k) + 0.5) / 8.0;
          vec3 q = vec3(xz.x, 0.0, xz.y) + uSunDir * (y / uSunDir.y);
          od += cloudDensity(q, deckHeight(q), 0.0);
        }
        od *= thick / 8.0 / uSunDir.y * uDensityScale * 0.22;
        gl_FragColor = vec4(exp(-od));
      }
    `,
    uniforms: { ...shared, uArea: { value: new Vector4(...SHADOW_AREA) } },
    depthTest: false,
    depthWrite: false,
  });

  const geometry = fullscreenTriangle();
  const weatherScene = new Scene();
  const shadowScene = new Scene();
  for (const [scene, material] of [
    [weatherScene, weatherMaterial],
    [shadowScene, shadowMaterial],
  ] as const) {
    const quad = new Mesh(geometry, material);
    quad.frustumCulled = false;
    scene.add(quad);
  }

  /** Draws both maps, the weather first since the shadows are cast by it. */
  const bake = async (renderer: WebGLRenderer, camera: OrthographicCamera) => {
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(weather);
    await Promise.all([renderer.compileAsync(weatherScene, camera), renderer.compileAsync(shadowScene, camera)]);
    renderer.setRenderTarget(weather);
    renderer.render(weatherScene, camera);
    renderer.setRenderTarget(shadow);
    renderer.render(shadowScene, camera);
    renderer.setRenderTarget(previous);
  };

  return {
    weather,
    shadow,
    weatherRect,
    shadowRect,
    bake,
    dispose: () => {
      weather.dispose();
      shadow.dispose();
      weatherMaterial.dispose();
      shadowMaterial.dispose();
      geometry.dispose();
    },
  };
}
