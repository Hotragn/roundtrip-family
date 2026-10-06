import type { FromWorker, ToWorker } from "./protocol";

/**
 * The sky's worker. It first asks the page's canvas for hardware WebGL 2, here and not on the
 * page: opening a WebGL context waits on the GPU process, which is busy drawing the page while
 * it loads, and that wait would block the page for a tenth of a second or more. If WebGL works
 * here and the page agrees ("go"), it loads three.js and the scene (sky-worker-scene.tsx);
 * otherwise nothing more is fetched and the page keeps its still.
 */

interface WorkerScope {
  postMessage(message: FromWorker): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
}
const scope = self as unknown as WorkerScope;
const post = (message: FromWorker) => scope.postMessage(message);

/** The context the renderer draws with: these settings are fixed when it is first created. */
const CONTEXT: WebGLContextAttributes = {
  alpha: false,
  depth: true,
  stencil: false,
  antialias: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: "high-performance",
  // A software renderer would draw the clouds at a few frames a second: keep the still instead.
  failIfMajorPerformanceCaveat: true,
};

let pending: { init: Extract<ToWorker, { type: "init" }>; gl: WebGL2RenderingContext } | null = null;
let scene: Promise<typeof import("./sky-worker-scene")> | null = null;
const waiting: ToWorker[] = [];

scope.onmessage = (event) => {
  const m = event.data;
  if (m.type === "init") {
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = m.canvas.getContext("webgl2", CONTEXT);
    } catch {
      gl = null;
    }
    if (!gl) {
      post({ type: "fail", reason: "no hardware WebGL 2" });
      return;
    }
    pending = { init: m, gl };
    post({ type: "webgl" });
    return;
  }
  if (m.type === "go") {
    const start = pending;
    if (!start || scene) return;
    scene = import("./sky-worker-scene").then((mod) => {
      mod.start(start.init, start.gl, post);
      for (const w of waiting.splice(0)) mod.handle(w);
      return mod;
    });
    scene.catch((e: unknown) => post({ type: "fail", reason: e instanceof Error ? e.message : String(e) }));
    return;
  }
  // Messages that arrive before the scene has loaded wait for it, in order.
  if (scene)
    scene.then(
      (mod) => mod.handle(m),
      () => {},
    );
  else waiting.push(m);
};
