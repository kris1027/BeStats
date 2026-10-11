import type { BackdropRenderer } from "./renderer";

/** `requestAnimationFrame` where it exists, injected so tests can step it. */
export interface FrameScheduler {
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
}

/**
 * The running clock as its owner sees it: the page's events in, nothing out.
 * The worker and the main thread fallback drive it through the same methods.
 */
export interface BackdropLoop {
  resize(width: number, height: number, pixelRatio: number): void;
  setPointer(x: number, y: number): void;
  setVisible(visible: boolean): void;
  setReducedMotion(reduced: boolean): void;
  dispose(): void;
}

/** The design capped a frame's step at 50ms, so a stall never lurches. */
export const MAX_STEP_SECONDS = 0.05;

/** The design's pointer easing, 4% per frame at 60 frames per second. */
const POINTER_EASE = 0.04;

/**
 * The animation clock (prompts/ambient-background.md, decisions 5 and 6).
 *
 * It runs only while the page is visible and motion is allowed. A hidden tab
 * requests no frames at all, and coming back resumes from where the clock
 * stopped rather than jumping by the time spent away. Under reduced motion it
 * draws a single still frame with the camera centred, and redraws only when
 * the size changes, because a permanently moving page is what that setting
 * exists to prevent (the `skeleton-pulse` precedent in `globals.css`).
 *
 * `onFirstFrame` fires once, after the first draw, so the canvas can fade in
 * over a real picture rather than a black one.
 */
export function createLoop({
  renderer,
  scheduler,
  reducedMotion,
  visible,
  onFirstFrame,
}: {
  renderer: BackdropRenderer;
  scheduler: FrameScheduler;
  reducedMotion: boolean;
  visible: boolean;
  onFirstFrame?: () => void;
}): BackdropLoop {
  let time = 0;
  let last: number | null = null;
  let handle: number | null = null;
  let sized = false;
  let disposed = false;
  let firstDrawn = false;
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };

  const draw = () => {
    renderer.draw({ time, pointerX: pointer.x, pointerY: pointer.y });
    if (!firstDrawn) {
      firstDrawn = true;
      onFirstFrame?.();
    }
  };

  const tick = (now: number) => {
    handle = null;
    const step =
      last === null ? 0 : Math.min((now - last) / 1000, MAX_STEP_SECONDS);
    last = now;
    time += step;
    // Frame rate independent version of the design's per frame lerp.
    const ease = 1 - (1 - POINTER_EASE) ** (step * 60);
    pointer.x += (pointer.targetX - pointer.x) * ease;
    pointer.y += (pointer.targetY - pointer.y) * ease;
    draw();
    handle = scheduler.request(tick);
  };

  const animating = () => sized && visible && !reducedMotion && !disposed;

  const stop = () => {
    if (handle !== null) scheduler.cancel(handle);
    handle = null;
    last = null;
  };

  const update = () => {
    if (animating()) {
      if (handle === null) handle = scheduler.request(tick);
      return;
    }
    stop();
    if (sized && visible && reducedMotion && !disposed) {
      pointer.x = pointer.y = pointer.targetX = pointer.targetY = 0;
      draw();
    }
  };

  return {
    resize(width, height, pixelRatio) {
      if (disposed) return;
      renderer.resize(width, height, pixelRatio);
      sized = true;
      // A resize clears the drawing buffer, so a still frame is redrawn now;
      // a running loop repaints on its next tick anyway.
      update();
    },
    setPointer(x, y) {
      pointer.targetX = x;
      pointer.targetY = y;
    },
    setVisible(next) {
      visible = next;
      update();
    },
    setReducedMotion(next) {
      reducedMotion = next;
      update();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      renderer.dispose();
    },
  };
}
