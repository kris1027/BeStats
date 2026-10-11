import { type BackdropLoop, createLoop, type FrameScheduler } from "./loop";
import type { BackdropBudget } from "./params";
import { type BackdropColors, createRenderer } from "./renderer";

export interface BackdropOptions {
  width: number;
  height: number;
  budget: BackdropBudget;
  colors: BackdropColors;
  reducedMotion: boolean;
  visible: boolean;
  onReady: () => void;
  onFailed: () => void;
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
 * Renderer plus clock on one canvas, the piece the worker and the main thread
 * fallback share (prompts/ambient-background.md, decision 3).
 *
 * Returns null when nothing can be drawn: no WebGL2, or a shader that does not
 * link. A context lost later (a GPU reset, or the browser reclaiming memory
 * from a background tab) stops the loop and reports failure too; the page then
 * keeps its static vignette rather than trying to rebuild the scene.
 */
export function createBackdrop(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  options: BackdropOptions,
): BackdropLoop | null {
  let renderer: ReturnType<typeof createRenderer>;
  try {
    renderer = createRenderer(canvas, options.budget, options.colors);
  } catch {
    renderer = null;
  }
  if (!renderer) return null;

  const loop = createLoop({
    renderer,
    scheduler: frameScheduler(),
    reducedMotion: options.reducedMotion,
    visible: options.visible,
    onFirstFrame: options.onReady,
  });

  // `addEventListener` exists on both canvas types; the cast only papers over
  // their differing event maps.
  (canvas as HTMLCanvasElement).addEventListener(
    "webglcontextlost",
    () => {
      loop.dispose();
      options.onFailed();
    },
    { once: true },
  );

  loop.resize(options.width, options.height, options.budget.pixelRatio);
  return loop;
}
