import { createRoot, extend, type RootStore } from "@react-three/fiber";
import { Group, Vector3, WebGLRenderer } from "three";
import { createControls, type FromWorker, notify, type SkyControls, type ToWorker } from "./protocol";
import { EXPOSURE, SkyWorld } from "./sky-world";

/**
 * The scene half of the sky's worker (sky.worker.ts loads it once WebGL works): three.js,
 * React Three Fiber and postprocessing, drawing on the page's canvas through an
 * OffscreenCanvas. Loading them, compiling shaders and drawing never touch the page's main
 * thread, so the page stays responsive while the sky comes in.
 */

// createRoot, unlike <Canvas>, registers no three.js classes; the composer renders a group.
extend({ Group });

type Post = (message: FromWorker) => void;

let controls: SkyControls | null = null;
let store: RootStore | null = null;

const redraw = () => {
  if (controls?.visible) store?.getState().invalidate();
};

export function start(m: Extract<ToWorker, { type: "init" }>, context: WebGL2RenderingContext, post: Post) {
  controls = createControls(m.capture ? 1 : m.intro);
  const c = controls;
  const root = createRoot(m.canvas);
  m.canvas.addEventListener("webglcontextlost", () => post({ type: "fail", reason: "context lost" }), { once: true });
  root
    .configure({
      frameloop: "never",
      dpr: m.dpr,
      size: { width: m.width, height: m.height, top: 0, left: 0 },
      // The context the worker already opened, with the settings it was opened with.
      gl: (defaults) => new WebGLRenderer({ ...defaults, canvas: m.canvas, context, antialias: false }),
      camera: { fov: 40, near: 5, far: 340000, position: [0, 2980, 0], manual: true },
      onCreated: ({ gl }) => {
        gl.debug.checkShaderErrors = process.env.NODE_ENV !== "production";
        gl.toneMappingExposure = EXPOSURE;
      },
    })
    .then(() => {
      store = root.render(
        <SkyWorld
          controls={c}
          pathColor={new Vector3(...m.pathColor)}
          capture={m.capture}
          onPrepared={() => {
            store?.getState().setFrameloop("demand");
            store?.getState().invalidate();
          }}
          onReady={() => post({ type: "ready" })}
          onStill={() => post({ type: "still" })}
          onFail={(reason) => post({ type: "fail", reason })}
        />,
      );
    })
    .catch((e: unknown) => post({ type: "fail", reason: e instanceof Error ? e.message : String(e) }));
}

export function handle(m: ToWorker) {
  if (!controls) return;
  switch (m.type) {
    case "size":
      store?.getState().setDpr(m.dpr);
      store?.getState().setSize(m.width, m.height, 0, 0);
      redraw();
      break;
    case "intro":
      controls.intro = m.value;
      redraw();
      break;
    case "climb":
      controls.climb = m.value;
      redraw();
      break;
    case "visible":
      controls.visible = m.value;
      redraw();
      break;
    case "intro-done":
      controls.intro = 1;
      controls.introDone = true;
      notify(controls);
      redraw();
      break;
    case "init":
    case "go":
      break;
  }
}
