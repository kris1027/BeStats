import { readBackdropColors } from "./colors";
import { chooseBudget, sameGeometry } from "./params";
import type { FromWorker, ToWorker } from "./protocol";

/** The page side of a running background, whichever thread draws it. */
interface Controller {
  resize(width: number, height: number): void;
  pointer(x: number, y: number): void;
  visible(visible: boolean): void;
  motion(reduced: boolean): void;
  dispose(): void;
}

const FADE = "opacity 600ms ease-out";

function supportsWorkerCanvas(): boolean {
  return (
    typeof Worker === "function" &&
    typeof HTMLCanvasElement.prototype.transferControlToOffscreen === "function"
  );
}

const clampUnit = (value: number) => Math.max(-1, Math.min(1, value));

/**
 * Starts the ambient background inside `host` and returns its cleanup
 * (prompts/ambient-background.md, decisions 3 to 7).
 *
 * The canvas is created here rather than rendered by React: once its control
 * is transferred to a worker it can never be transferred again, so a canvas
 * React kept across a Strict Mode remount would throw. Each start gets a
 * fresh one and the cleanup removes it.
 *
 * Draws in a worker where the browser can hand a canvas to one, and on the
 * main thread otherwise, or when the worker cannot draw (Safari 16 has
 * `OffscreenCanvas` but no WebGL on it). The renderer chunk is loaded only on
 * the path that needs it. If neither can draw, the canvas is removed and the
 * page keeps its static vignette.
 *
 * The budget follows the viewport (decision 5): a resize across the compact
 * breakpoint rebuilds the scene at the other density, because its geometry is
 * uploaded once and cannot change in place. A resize within one budget only
 * resizes the canvas, picking up a changed pixel ratio on the way.
 *
 * The canvas stays transparent until the first frame is drawn, then fades in,
 * except under reduced motion, where it appears without a transition.
 */
export function mountBackdrop(host: HTMLElement): () => void {
  const colors = readBackdropColors(host);
  if (!colors) return () => {};

  const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  const coarseQuery = matchMedia("(pointer: coarse)");
  const currentBudget = () =>
    chooseBudget({
      viewportWidth: innerWidth,
      coarsePointer: coarseQuery.matches,
      devicePixelRatio,
    });

  let budget = currentBudget();
  let controller: Controller | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let disposed = false;
  let stopped = false;
  let workerUsable = supportsWorkerCanvas();
  // Bumped by every start, so a slow main thread start or a late callback
  // from a scene already replaced cannot touch the current one.
  let run = 0;

  const size = () => {
    const rect = host.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  };
  const state = () => ({
    budget,
    colors,
    reducedMotion: motionQuery.matches,
    visible: !document.hidden,
  });

  const freshCanvas = () => {
    canvas?.remove();
    const next = document.createElement("canvas");
    next.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0";
    host.prepend(next);
    canvas = next;
    return next;
  };

  const reveal = () => {
    if (!canvas) return;
    canvas.style.transition = motionQuery.matches ? "none" : FADE;
    canvas.style.opacity = "1";
  };

  const teardown = () => {
    controller?.dispose();
    controller = null;
    canvas?.remove();
    canvas = null;
  };

  // The worker could not draw at all: the main thread may still manage.
  const fallBack = () => {
    teardown();
    workerUsable = false;
    if (!disposed) start();
  };

  // A context lost after drawing is not retried anywhere (decision 7): a GPU
  // reset or memory pressure would only take the next one away too.
  const giveUp = () => {
    teardown();
    stopped = true;
  };

  /** Wraps a callback so it is ignored once its scene has been replaced. */
  const current = (own: number, callback: () => void) => () => {
    if (own === run) callback();
  };

  async function startMainThread(own: number) {
    const target = freshCanvas();
    let createBackdrop: typeof import("./backdrop").createBackdrop;
    try {
      ({ createBackdrop } = await import("./backdrop"));
    } catch {
      return current(own, giveUp)();
    }
    if (disposed || own !== run) return;
    const loop = createBackdrop(target, {
      ...size(),
      ...state(),
      onReady: current(own, reveal),
      onLost: current(own, giveUp),
    });
    if (!loop) return giveUp();
    controller = {
      resize: (width, height) => loop.resize(width, height, budget.pixelRatio),
      pointer: loop.setPointer,
      visible: loop.setVisible,
      motion: loop.setReducedMotion,
      dispose: loop.dispose,
    };
  }

  function startWorker(own: number) {
    const offscreen = freshCanvas().transferControlToOffscreen();
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
      name: "backdrop",
    });
    const post = (message: ToWorker, transfer: Transferable[] = []) =>
      worker.postMessage(message, transfer);
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      if (own !== run) return;
      if (event.data.type === "ready") reveal();
      else if (event.data.type === "lost") giveUp();
      else fallBack();
    };
    worker.onerror = current(own, fallBack);
    post({ type: "init", canvas: offscreen, ...size(), ...state() }, [
      offscreen,
    ]);
    controller = {
      resize: (width, height) =>
        post({
          type: "resize",
          width,
          height,
          pixelRatio: budget.pixelRatio,
        }),
      pointer: (x, y) => post({ type: "pointer", x, y }),
      visible: (visible) => post({ type: "visible", visible }),
      motion: (reduced) => post({ type: "motion", reduced }),
      dispose: () => worker.terminate(),
    };
  }

  function start() {
    run += 1;
    if (!workerUsable) {
      void startMainThread(run);
      return;
    }
    try {
      startWorker(run);
    } catch {
      fallBack();
    }
  }

  // The host is sized to the large viewport (`h-lvh`), so a phone's toolbar
  // collapsing on scroll does not resize, and so reallocate, the canvas.
  const resizeObserver = new ResizeObserver(() => {
    if (stopped) return;
    const next = currentBudget();
    const rebuild = !sameGeometry(budget, next);
    budget = next;
    if (rebuild) {
      teardown();
      start();
      return;
    }
    const { width, height } = size();
    controller?.resize(width, height);
  });

  // Pointer moves are coalesced to one message per frame.
  let pointerFrame: number | null = null;
  let pointerX = 0;
  let pointerY = 0;
  const onPointerMove = (event: PointerEvent) => {
    // The still frame ignores the pointer (AC-5), so nothing is sent.
    if (motionQuery.matches) return;
    pointerX = clampUnit(event.clientX / innerWidth - 0.5);
    pointerY = clampUnit(event.clientY / innerHeight - 0.5);
    if (pointerFrame !== null) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = null;
      controller?.pointer(pointerX, pointerY);
    });
  };
  const onVisibility = () => controller?.visible(!document.hidden);
  const onMotion = () => controller?.motion(motionQuery.matches);

  start();

  resizeObserver.observe(host);
  addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  motionQuery.addEventListener("change", onMotion);

  return () => {
    disposed = true;
    run += 1;
    resizeObserver.disconnect();
    removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("visibilitychange", onVisibility);
    motionQuery.removeEventListener("change", onMotion);
    if (pointerFrame !== null) cancelAnimationFrame(pointerFrame);
    teardown();
  };
}
