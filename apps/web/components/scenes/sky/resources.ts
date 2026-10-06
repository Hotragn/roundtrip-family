import {
  BufferAttribute,
  BufferGeometry,
  CubicBezierCurve3,
  Group,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NoToneMapping,
  OrthographicCamera,
  type PerspectiveCamera,
  PlaneGeometry,
  Points,
  Scene,
  type Texture,
  Vector3,
  Vector4,
  type WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { skyConstants, skyIrradiance, skyRadiance, sunIrradiance } from "./atmosphere";
import { cloudFieldUniforms } from "./cloud-field";
import { createCloudsMaterial } from "./clouds-material";
import { createFieldMaps } from "./field-maps";
import { createNoiseVolume, fullscreenTriangle } from "./noise-volume";
import { createBlendMaterial, createCompositeMaterial, createPathMaterial } from "./overlay-materials";
import { createTerrainMaterial } from "./terrain-material";
import { CLOUDS, FLIGHT, HAZE, SKY } from "./world";

/** Everything the scene draws, built once and disposed together. */
export function createSkyResources(pathColor: Vector3) {
  const noise = createNoiseVolume(128);
  const k = skyConstants(SKY);
  // Preetham's low sun is quite orange; keep under half its color, for white clouds in a light morning.
  const sunRaw = sunIrradiance(k);
  const sunLum = sunRaw.x * 0.2126 + sunRaw.y * 0.7152 + sunRaw.z * 0.0722;
  const sunIrr = new Vector3(sunLum, sunLum, sunLum).lerp(sunRaw, 0.42);
  const skyIrr = skyIrradiance(k);

  // Uniform objects shared by the clouds, the ground and their shadows: one update reaches all.
  const shared = {
    uNoise: { value: noise.target.texture },
    uSunDir: { value: k.sunDir.clone() },
    uBetaR: { value: k.betaR.clone() },
    uBetaM: { value: k.betaM.clone() },
    uSunE: { value: k.sunE },
    uMieG: { value: k.mieG },
    uSunIrr: { value: sunIrr },
    uSkyIrr: { value: skyIrr },
    uHazeDensity: { value: HAZE.density },
    uHazeHeight: { value: HAZE.height },
    uCamPos: { value: new Vector3() },
    uDensityScale: { value: CLOUDS.density },
    uLightAbsorb: { value: CLOUDS.lightAbsorb },
    ...cloudFieldUniforms(),
    uWeatherMap: { value: null as Texture | null },
    uWeatherRect: { value: new Vector4() },
  };
  const maps = createFieldMaps(shared);
  shared.uWeatherMap.value = maps.weather.texture;
  shared.uWeatherRect.value.copy(maps.weatherRect);

  // Clouds: raymarched into a smaller buffer, then laid over the sky and the ground.
  const cloudTarget = new WebGLRenderTarget(2, 2, {
    type: HalfFloatType,
    depthBuffer: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: false,
  });
  // When the camera holds still, frames with different jitter are averaged into a clean image.
  const history = [0, 1].map(
    () =>
      new WebGLRenderTarget(2, 2, {
        type: HalfFloatType,
        depthBuffer: false,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        generateMipmaps: false,
      }),
  );
  const blendMaterial = createBlendMaterial();
  const blendScene = new Scene();
  const cloudsMaterial = createCloudsMaterial(shared);
  // Ambient light inside the deck: the sky's average from above, sunlit ground from below.
  const zenith = skyRadiance(k, new Vector3(0, 1, 0));
  const avgSky = skyIrr.clone().multiplyScalar(1 / Math.PI);
  cloudsMaterial.uniforms.uAmbTop.value.copy(avgSky.clone().lerp(zenith, 0.35));
  cloudsMaterial.uniforms.uAmbBottom.value.copy(
    sunIrr
      .clone()
      .multiplyScalar(k.sunDir.y * 0.05)
      .add(skyIrr.clone().multiplyScalar(0.075)),
  );
  const triangle = fullscreenTriangle();
  const cloudScene = new Scene();
  const cloudQuad = new Mesh(triangle, cloudsMaterial);
  cloudQuad.frustumCulled = false;
  cloudScene.add(cloudQuad);
  const blendQuad = new Mesh(triangle, blendMaterial);
  blendQuad.frustumCulled = false;
  blendScene.add(blendQuad);
  const ortho = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // The sky: three.js's Sky addon, with its own 2D clouds off (the deck is volumetric).
  const sky = new Sky();
  sky.scale.setScalar(300000);
  const su = sky.material.uniforms;
  su.turbidity.value = SKY.turbidity;
  su.rayleigh.value = SKY.rayleigh;
  su.mieCoefficient.value = SKY.mieCoefficient;
  su.mieDirectionalG.value = SKY.mieDirectionalG;
  su.sunPosition.value.copy(k.sunDir);
  su.cloudCoverage.value = 0;
  sky.renderOrder = -1;
  sky.frustumCulled = false;

  const terrainMaterial = createTerrainMaterial(shared, maps.shadow.texture, maps.shadowRect);
  const terrainGeometry = new PlaneGeometry(300000, 300000, 192, 192);
  terrainGeometry.rotateX(-Math.PI / 2);
  terrainGeometry.translate(0, 0, -110000);
  const terrain = new Mesh(terrainGeometry, terrainMaterial);
  terrain.frustumCulled = false;

  const compositeMaterial = createCompositeMaterial(history[0].texture);
  const composite = new Mesh(triangle, compositeMaterial);
  composite.frustumCulled = false;
  composite.renderOrder = 10;

  const group = new Group();
  group.add(sky, terrain, composite);

  // The flight path, evenly spaced along its length.
  const curve = new CubicBezierCurve3(FLIGHT.p0, FLIGHT.p1, FLIGHT.p2, FLIGHT.p3);
  const count = 132;
  const points = curve.getSpacedPoints(count - 1);
  const positions = new Float32Array(count * 3);
  const ts = new Float32Array(count);
  points.forEach((p, i) => {
    positions.set([p.x, p.y, p.z], i * 3);
    ts[i] = i / (count - 1);
  });
  const pathGeometry = new BufferGeometry();
  pathGeometry.setAttribute("position", new BufferAttribute(positions, 3));
  pathGeometry.setAttribute("aT", new BufferAttribute(ts, 1));
  const pathMaterial = createPathMaterial(history[0].texture, pathColor);
  pathMaterial.uniforms.uDeckTop.value = CLOUDS.top;
  pathMaterial.uniforms.uDeckBase.value = CLOUDS.base;
  const path = new Points(pathGeometry, pathMaterial);
  path.frustumCulled = false;
  const overlay = new Scene();
  overlay.add(path);

  /**
   * Compiles every shader in the background (KHR_parallel_shader_compile), in the same state
   * it will be drawn in, so the first frame never stalls the page.
   */
  const compile = async (renderer: WebGLRenderer, camera: PerspectiveCamera) => {
    const previousTarget = renderer.getRenderTarget();
    const previousToneMapping = renderer.toneMapping;
    renderer.toneMapping = NoToneMapping;
    renderer.setRenderTarget(cloudTarget);
    const offscreen = [
      renderer.compileAsync(group, camera),
      renderer.compileAsync(cloudScene, ortho),
      renderer.compileAsync(blendScene, ortho),
    ];
    renderer.setRenderTarget(null);
    const onscreen = renderer.compileAsync(overlay, camera);
    renderer.setRenderTarget(previousTarget);
    renderer.toneMapping = previousToneMapping;
    await Promise.all([...offscreen, onscreen]);
  };

  /**
   * Draws this frame's clouds and folds them into the running average. "still" counts the
   * frames the camera has not moved; zero starts over. Returns the texture to show.
   */
  let current = 0;
  const renderClouds = (renderer: WebGLRenderer, width: number, height: number, still: number) => {
    for (const t of [cloudTarget, ...history]) if (t.width !== width || t.height !== height) t.setSize(width, height);
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(cloudTarget);
    renderer.render(cloudScene, ortho);
    const read = history[current];
    const write = history[1 - current];
    blendMaterial.uniforms.uCurrent.value = cloudTarget.texture;
    blendMaterial.uniforms.uHistory.value = read.texture;
    blendMaterial.uniforms.uWeight.value = 1 / (still + 1);
    renderer.setRenderTarget(write);
    renderer.render(blendScene, ortho);
    renderer.setRenderTarget(previous);
    current = 1 - current;
    compositeMaterial.uniforms.uClouds.value = write.texture;
    pathMaterial.uniforms.uClouds.value = write.texture;
    terrainMaterial.uniforms.uClouds.value = write.texture;
  };

  const dispose = () => {
    noise.dispose();
    maps.dispose();
    cloudTarget.dispose();
    for (const t of history) t.dispose();
    for (const m of [cloudsMaterial, terrainMaterial, compositeMaterial, pathMaterial, blendMaterial, sky.material])
      m.dispose();
    for (const g of [triangle, terrainGeometry, pathGeometry, sky.geometry]) g.dispose();
  };

  return {
    noise,
    maps,
    shared,
    terrainMaterial,
    cloudTarget,
    cloudsMaterial,
    cloudScene,
    ortho,
    group,
    overlay,
    pathMaterial,
    compile,
    renderClouds,
    dispose,
  };
}

export type SkyResources = ReturnType<typeof createSkyResources>;
