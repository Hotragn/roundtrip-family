import {
  AddEquation,
  CustomBlending,
  NormalBlending,
  OneFactor,
  ShaderMaterial,
  SrcAlphaFactor,
  type Texture,
  Vector2,
  type Vector3,
  ZeroFactor,
} from "three";
import { FULLSCREEN_VERT } from "./noise-volume";

/**
 * Lays the low-resolution cloud buffer over the sky and the ground, before bloom and tone
 * mapping: what is behind keeps "alpha" of its light, and the clouds add theirs.
 */
export function createCompositeMaterial(clouds: Texture) {
  return new ShaderMaterial({
    name: "SkyCloudComposite",
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D uClouds;
      varying vec2 vUv;
      void main() {
        gl_FragColor = texture2D(uClouds, vUv);
      }
    `,
    uniforms: { uClouds: { value: clouds } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: SrcAlphaFactor,
    blendEquationAlpha: AddEquation,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneFactor,
  });
}

/** Folds this frame's clouds into the running average of the frames before it. */
export function createBlendMaterial() {
  return new ShaderMaterial({
    name: "SkyCloudAverage",
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D uCurrent;
      uniform sampler2D uHistory;
      uniform float uWeight;
      varying vec2 vUv;
      void main() {
        gl_FragColor = mix(texture2D(uHistory, vUv), texture2D(uCurrent, vUv), uWeight);
      }
    `,
    uniforms: { uCurrent: { value: null }, uHistory: { value: null }, uWeight: { value: 1 } },
    depthTest: false,
    depthWrite: false,
  });
}

/**
 * The flight path: a fine dotted arc, like the sky travel line in the interface. It is drawn
 * after tone mapping, straight in the sky-line token's sRGB color, and fades where cloud
 * lies between it and the camera.
 */
export function createPathMaterial(clouds: Texture, color: Vector3) {
  return new ShaderMaterial({
    name: "SkyFlightPath",
    vertexShader: /* glsl */ `
      attribute float aT;
      uniform float uPixelRatio;
      uniform float uSize;
      uniform float uReveal;
      uniform float uDeckTop;
      uniform float uDeckBase;
      varying float vAlpha;
      varying float vBelow;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        // Dots shrink a little with distance, like a line drawn on the landscape.
        gl_PointSize = uSize * uPixelRatio * clamp(9000.0 / dist, 0.62, 1.0);
        float fadeIn = smoothstep(0.0, 0.14, aT);
        float fadeOut = 1.0 - smoothstep(0.93, 1.0, aT);
        float reveal = smoothstep(aT - 0.04, aT, uReveal);
        vAlpha = fadeIn * fadeOut * reveal;
        vBelow = smoothstep(uDeckTop, uDeckBase, position.y);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform sampler2D uClouds;
      uniform vec2 uResolution;
      varying float vAlpha;
      varying float vBelow;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c) * 2.0;
        float disc = 1.0 - smoothstep(0.62, 1.0, r);
        float through = texture2D(uClouds, gl_FragCoord.xy / uResolution).a;
        float a = disc * vAlpha * uOpacity * mix(1.0, through, vBelow);
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    uniforms: {
      uColor: { value: color },
      uOpacity: { value: 0.82 },
      uSize: { value: 3.6 },
      uPixelRatio: { value: 1 },
      uReveal: { value: 1 },
      uDeckTop: { value: 2450 },
      uDeckBase: { value: 1250 },
      uClouds: { value: clouds },
      uResolution: { value: new Vector2(1, 1) },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: NormalBlending,
    toneMapped: false,
  });
}
