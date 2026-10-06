import { PerformanceMonitor } from "@react-three/drei/core/PerformanceMonitor";
import { useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { type EffectComposer as EffectComposerImpl, ToneMappingMode } from "postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import { HalfFloatType, type PerspectiveCamera, Vector2, Vector3 } from "three";
import type { CaptureSettings, SkyControls } from "./protocol";
import { createSkyResources } from "./resources";
import { CAMERA, framing, settle, TOWN } from "./world";

/**
 * The landing page's morning sky: three.js's Sky addon at a low morning sun, raymarched
 * volumetric clouds and the coast far below, with soft bloom and tone mapping from pmndrs
 * postprocessing. It runs inside a worker (sky.worker.tsx) and reads where the camera should
 * be from the page's controls. It draws only when something changed, and while the camera
 * holds it averages a few more frames into a clean picture, then stops.
 */

const DEG = Math.PI / 180;
/** Frames averaged into a still view. */
const ACCUMULATE = 16;
export const EXPOSURE = 0.8;
/** The cloud buffer's pixel budget while live; the still capture sets its own quality. */
const CLOUD_PIXELS = 300_000;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const _target = new Vector3();
const _seen = new Vector3();
const _pos = new Vector3();
const _buf = new Vector2();
const _toStart = CAMERA.start.pos.clone().sub(CAMERA.hold.pos);
const _toTop = CAMERA.top.pos.clone().sub(CAMERA.hold.pos);

/**
 * Turns the camera so that, seen from the hold, the town sits where the layout wants it, then
 * places it at "pos" with that heading plus a tilt. The climb keeps the heading, so scrolling
 * rises into more sky instead of tipping down toward the ground.
 */
function aim(camera: PerspectiveCamera, pos: Vector3, aspect: number, tilt: number) {
  const f = framing(aspect);
  camera.fov = f.fov;
  camera.aspect = aspect;
  const from = CAMERA.hold.pos;
  camera.position.copy(from);
  const dx = TOWN.x - from.x;
  const dz = TOWN.z - from.z;
  const horizontal = Math.hypot(dx, dz);
  _target.set(TOWN.x, TOWN.y - (horizontal * horizontal) / (2 * 6371000), TOWN.z);
  const tanV = Math.tan((f.fov * DEG) / 2);
  const tanH = tanV * aspect;
  const xd = f.subjectX * 2 - 1;
  const yd = 1 - f.subjectY * 2;
  let az = Math.atan2(dx, -dz) - Math.atan(xd * tanH);
  let el = Math.atan2(_target.y - from.y, horizontal) - Math.atan(yd * tanV);
  for (let i = 0; i < 4; i++) {
    camera.rotation.set(el, -az, 0, "YXZ");
    camera.updateMatrixWorld();
    _seen.copy(_target).applyMatrix4(camera.matrixWorldInverse);
    const x = _seen.x / -_seen.z / tanH;
    const y = _seen.y / -_seen.z / tanV;
    az += Math.atan(x * tanH) - Math.atan(xd * tanH);
    el += Math.atan(y * tanV) - Math.atan(yd * tanV);
  }
  camera.position.copy(pos);
  camera.rotation.set(el + tilt * DEG, -az, 0, "YXZ");
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

export interface SkyWorldProps {
  controls: SkyControls;
  pathColor: Vector3;
  capture?: CaptureSettings;
  /** Shaders are compiled; drawing can start. */
  onPrepared: () => void;
  /** The first frame is drawn. */
  onReady: () => void;
  /** The averaged still view is clean. */
  onStill: () => void;
  onFail: (reason: string) => void;
}

export function SkyWorld({ controls, pathColor, capture, onPrepared, onReady, onStill, onFail }: SkyWorldProps) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);
  const [prepared, setPrepared] = useState(false);
  const [measuring, setMeasuring] = useState(!capture && !controls.introDone);
  const res = useMemo(() => createSkyResources(pathColor), [pathColor]);
  const quality = useRef({ scale: capture?.cloudScale ?? 0.5, steps: capture?.steps ?? 60 });
  const live = useRef({ frame: 0, shown: false, stillSent: false });
  const composer = useRef<EffectComposerImpl | null>(null);
  const callbacks = useRef({ onPrepared, onReady, onStill, onFail });
  callbacks.current = { onPrepared, onReady, onStill, onFail };

  const placeCamera = (aspect: number) => {
    const e = settle(controls.intro);
    _pos
      .copy(CAMERA.hold.pos)
      .addScaledVector(_toStart, 1 - e)
      .addScaledVector(_toTop, controls.climb);
    const tilt = CAMERA.start.tilt * (1 - e) + CAMERA.top.tilt * controls.climb;
    aim(camera, _pos, aspect, tilt);
    // Like a camera's exposure inside a cloud: brighter in the mist, settling as the view opens.
    const mist = 1 - smoothstep(0.12, 0.42, controls.intro);
    gl.toneMappingExposure = EXPOSURE * (1 + 0.38 * mist);
    res.cloudsMaterial.uniforms.uInner.value = 0.05 + 0.06 * mist;
  };

  // Bake the noise and the maps, then compile every shader without stalling, then start drawing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per renderer
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await res.noise.bake(gl, 16);
      res.shared.uCamPos.value.copy(CAMERA.hold.pos);
      await res.maps.bake(gl, res.ortho);
      const size = gl.getSize(_buf);
      placeCamera(size.x / Math.max(1, size.y));
      await res.compile(gl, camera);
      if (cancelled) return;
      setPrepared(true);
      callbacks.current.onPrepared();
    })().catch((e: unknown) => callbacks.current.onFail(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [res, gl]);

  useEffect(() => () => res.dispose(), [res]);

  useEffect(() => {
    if (prepared) invalidate();
  }, [prepared, invalidate]);

  // The performance monitor only watches the intro: afterwards frames come only on demand.
  useEffect(() => {
    const update = () => setMeasuring(!capture && !controls.introDone);
    controls.listeners.add(update);
    return () => {
      controls.listeners.delete(update);
    };
  }, [controls, capture]);

  // 1. The camera.
  useFrame((state) => {
    placeCamera(state.size.width / Math.max(1, state.size.height));
  }, -2);

  // 2. The clouds, into their own smaller buffer; averaged over frames while the camera holds.
  const still = useRef({ count: 0, view: new Float64Array(16), proj: new Float64Array(16), w: 0, h: 0 });
  useFrame((state) => {
    const q = quality.current;
    state.gl.getDrawingBufferSize(_buf);
    // Clouds are soft: a fraction of the screen's pixels, and never more than a set budget.
    const scale = capture ? q.scale : Math.min(q.scale, Math.sqrt(CLOUD_PIXELS / Math.max(1, _buf.x * _buf.y)));
    const w = Math.max(2, Math.round(_buf.x * scale));
    const h = Math.max(2, Math.round(_buf.y * scale));
    const s = still.current;
    let moved = w !== s.w || h !== s.h;
    for (let i = 0; i < 16; i++) {
      if (s.view[i] !== camera.matrixWorld.elements[i] || s.proj[i] !== camera.projectionMatrix.elements[i])
        moved = true;
      s.view[i] = camera.matrixWorld.elements[i];
      s.proj[i] = camera.projectionMatrix.elements[i];
    }
    s.w = w;
    s.h = h;
    s.count = moved ? 0 : Math.min(s.count + 1, ACCUMULATE);
    res.shared.uCamPos.value.copy(camera.position);
    const u = res.cloudsMaterial.uniforms;
    u.uInvViewProj.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    u.uFrame.value = live.current.frame++ % 64;
    u.uSteps.value = q.steps;
    const pu = res.pathMaterial.uniforms;
    pu.uResolution.value.copy(_buf);
    res.terrainMaterial.uniforms.uResolution.value.copy(_buf);
    pu.uPixelRatio.value = state.gl.getPixelRatio();
    pu.uReveal.value = Math.min(1.05, (controls.intro - 0.25) / 0.7);
    res.renderClouds(state.gl, w, h, s.count);
    // Keep refining a still view until the average is clean, then stop drawing.
    if (s.count < ACCUMULATE && controls.visible) state.invalidate();
    if (s.count >= ACCUMULATE && !live.current.stillSent) {
      live.current.stillSent = true;
      callbacks.current.onStill();
    } else if (s.count < ACCUMULATE) live.current.stillSent = false;
  }, -1);

  // 4. The flight path, after tone mapping, in the token's own color.
  useFrame((state) => {
    const autoClear = state.gl.autoClear;
    state.gl.autoClear = false;
    state.gl.setRenderTarget(null);
    state.gl.render(res.overlay, camera);
    state.gl.autoClear = autoClear;
    if (!live.current.shown) {
      // The composer builds its passes a render or two after it mounts; wait for a real frame.
      if ((composer.current?.passes.length ?? 0) < 2) {
        state.invalidate();
        return;
      }
      live.current.shown = true;
      callbacks.current.onReady();
    }
  }, 2);

  if (!prepared) return null;
  return (
    <>
      <primitive object={res.group} />
      {measuring ? (
        <PerformanceMonitor
          ms={200}
          iterations={6}
          threshold={0.7}
          onDecline={() => {
            Object.assign(quality.current, { scale: 0.36, steps: 44 });
          }}
        />
      ) : null}
      {/* 3. Bloom and tone mapping over the sky, the ground and the clouds. */}
      <EffectComposer ref={composer} multisampling={0} frameBufferType={HalfFloatType} renderPriority={1}>
        <Bloom mipmapBlur luminanceThreshold={0.95} luminanceSmoothing={0.4} intensity={0.32} radius={0.72} />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      </EffectComposer>
    </>
  );
}
