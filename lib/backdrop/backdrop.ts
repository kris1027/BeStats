import type { BackdropColors } from "./colors";
import { type BackdropLoop, createLoop, type FrameScheduler } from "./loop";
import type { BackdropBudget } from "./params";
import { createRenderer } from "./renderer";

export interface BackdropOptions {
  width: number;
  height: number;
  budget: BackdropBudget;
  colors: BackdropColors;
  reducedMotion: boolean;
  visible: boolean;
  onReady: () => void;
  onLost: () => void;
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
 * from a background tab) stops the loop and calls `onLost`, a separate signal
 * because the page then keeps its static vignette rather than rebuilding the
 * scene elsewhere (decision 7).
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

  // Both canvas types dispatch the event; the cast only papers over their
  // differing event maps.
  const target = canvas as HTMLCanvasElement;
  const onContextLost = () => {
    loop.dispose();
    options.onLost();
  };
  target.addEventListener("webglcontextlost", onContextLost, { once: true });

  loop.resize(options.width, options.height, options.budget.pixelRatio);
  return {
    ...loop,
    // Disposing releases the context on purpose, which fires the same event;
    // the listener goes first so that is never reported as a loss.
    dispose() {
      target.removeEventListener("webglcontextlost", onContextLost);
      loop.dispose();
    },
  };
}
