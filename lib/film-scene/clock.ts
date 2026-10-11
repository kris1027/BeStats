import type { SceneRenderer } from "./scene";

/** `requestAnimationFrame` where it exists, injected so tests can step it. */
export interface FrameScheduler {
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
}

/**
 * The running clock as its owner sees it: the page's events in, nothing out.
 * The worker and the main thread fallback drive it through the same methods.
 */
export interface SceneClock {
  resize(width: number, height: number, pixelRatio: number): void;
  setVisible(visible: boolean): void;
  setReducedMotion(reduced: boolean): void;
  dispose(): void;
}

/** The design capped a frame's step at 50ms, so a stall never lurches. */
export const MAX_STEP_SECONDS = 0.05;

/** The design's `speed` prop: scene seconds per real second. */
export const SCENE_SPEED = 0.25;

/** How often a running clock reports its time, in real milliseconds. */
export const TIME_REPORT_MS = 1000;

/**
 * The animation clock (prompts/film-strip-background.md, decisions 8 and 9).
 *
 * It runs only while the page is visible and motion is allowed. A hidden tab
 * requests no frames at all, and coming back resumes from where the clock
 * stopped rather than jumping by the time spent away. Under reduced motion it
 * draws a single still frame, and redraws only when the size changes,
 * because a permanently moving page is what that setting exists to prevent (the `skeleton-pulse` precedent in `globals.css`).
 *
 * `onFirstFrame` fires once, after the first draw, so the canvas can fade in
 * over a real picture rather than an empty one.
 *
 * `startTime` and `onTime` let the scene carry on across a full page load
 * (prompts/film-scene-continuity.md, decision 2): the clock starts where the
 * last document left it, and reports its time at most once a second while
 * running, plus once whenever it stops, so the page always holds a value at
 * most a second old.
 */
export function createClock({
  renderer,
  scheduler,
  reducedMotion,
  visible,
  onFirstFrame,
  startTime = 0,
  onTime,
}: {
  renderer: SceneRenderer;
  scheduler: FrameScheduler;
  reducedMotion: boolean;
  visible: boolean;
  onFirstFrame?: () => void;
  startTime?: number;
  onTime?: (time: number) => void;
}): SceneClock {
  let time = startTime;
  let reported = startTime;
  let lastReport: number | null = null;
  let last: number | null = null;
  let handle: number | null = null;
  let sized = false;
  let disposed = false;
  let firstDrawn = false;

  const draw = () => {
    renderer.draw({ time });
    if (!firstDrawn) {
      firstDrawn = true;
      onFirstFrame?.();
    }
  };

  const report = () => {
    if (time === reported) return;
    reported = time;
    onTime?.(time);
  };

  const tick = (now: number) => {
    handle = null;
    const step =
      last === null ? 0 : Math.min((now - last) / 1000, MAX_STEP_SECONDS);
    last = now;
    time += step * SCENE_SPEED;
    draw();
    if (lastReport === null) lastReport = now;
    else if (now - lastReport >= TIME_REPORT_MS) {
      lastReport = now;
      report();
    }
    handle = scheduler.request(tick);
  };

  const animating = () => sized && visible && !reducedMotion && !disposed;

  const stop = () => {
    if (handle !== null) scheduler.cancel(handle);
    handle = null;
    last = null;
    lastReport = null;
    report();
  };

  const update = () => {
    if (animating()) {
      if (handle === null) handle = scheduler.request(tick);
      return;
    }
    stop();
    if (sized && visible && reducedMotion && !disposed) draw();
  };

  return {
    resize(width, height, pixelRatio) {
      if (disposed) return;
      renderer.resize(width, height, pixelRatio);
      sized = true;
      // A resize clears the drawing buffer, so a still frame is redrawn now;
      // a running clock repaints on its next tick anyway.
      update();
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
