import type { SceneBudget } from "./budget";
import { createClock, type FrameScheduler, type SceneClock } from "./clock";
import type { ScenePalette } from "./palette";
import { createScene, type SceneRenderer } from "./scene";

/**
 * Everything one scene needs to start, the same fields whichever thread draws
 * it, so the worker's `init` message spreads straight into it.
 */
export interface RunOptions {
  width: number;
  height: number;
  budget: SceneBudget;
  palette: ScenePalette;
  reducedMotion: boolean;
  visible: boolean;
  onReady: () => void;
  onLost: () => void;
  /** Where the clock starts (prompts/film-scene-continuity.md). */
  time: number;
  onTime: (time: number) => void;
}

/**
 * `requestAnimationFrame` where the global scope has it (every window, and
 * dedicated workers in current browsers), a 60 per second timer otherwise.
 */
function frameScheduler(): FrameScheduler {
  if (typeof requestAnimationFrame === "function") {
    return {
      request: (callback) => requestAnimationFrame(callback),
      cancel: (handle) => cancelAnimationFrame(handle),
    };
  }
  return {
    request: (callback) =>
      setTimeout(
        () => callback(performance.now()),
        1000 / 60,
      ) as unknown as number,
    cancel: (handle) => clearTimeout(handle),
  };
}

/**
 * Scene plus clock on one canvas, the piece the worker and the main thread
 * fallback share (prompts/film-strip-background.md, decision 7).
 *
 * Returns null when nothing can be drawn: no WebGL2, or a shader that does not
 * link. A context lost later (a GPU reset, or the browser reclaiming memory
 * from a background tab) stops the clock and calls `onLost`, a separate signal
 * because the page then keeps its CSS gradient rather than rebuilding the
 * scene elsewhere (decision 10).
 */
export function runScene(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  options: RunOptions,
): SceneClock | null {
  let renderer: SceneRenderer | null;
  try {
    renderer = createScene(canvas, options.budget, options.palette);
  } catch {
    renderer = null;
  }
  if (!renderer) return null;

  const clock = createClock({
    renderer,
    scheduler: frameScheduler(),
    reducedMotion: options.reducedMotion,
    visible: options.visible,
    onFirstFrame: options.onReady,
    startTime: options.time,
    onTime: options.onTime,
  });

  // Both canvas types dispatch the event; the cast only papers over their
  // differing event maps.
  const target = canvas as HTMLCanvasElement;
  const onContextLost = () => {
    clock.dispose();
    options.onLost();
  };
  target.addEventListener("webglcontextlost", onContextLost, { once: true });

  clock.resize(options.width, options.height, options.budget.pixelRatio);
  return {
    ...clock,
    // Disposing releases the context on purpose, which fires the same event;
    // the listener goes first so that is never reported as a loss.
    dispose() {
      target.removeEventListener("webglcontextlost", onContextLost);
      clock.dispose();
    },
  };
}
