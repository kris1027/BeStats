import { chooseBudget, sameGeometry } from "./budget";
import { readSceneTime, saveSceneTime } from "./continuity";
import type { FromWorker, ToWorker } from "./messages";
import { readScenePalette } from "./palette";
import type { RunOptions } from "./run";

/** The page side of a running scene, whichever thread draws it. */
interface Controller {
  resize(width: number, height: number, pixelRatio: number): void;
  visible(visible: boolean): void;
  motion(reduced: boolean): void;
  dispose(): void;
}

/**
 * What a scene tells the page. Each callback is bound to the start that made
 * it, so a late report from a scene already replaced is dropped.
 */
interface SceneEvents {
  /** The first frame is drawn. */
  ready(): void;
  /** It never drew, so the other thread may still manage. */
  failed(): void;
  /** It drew and then lost its context, and nothing is retried. */
  lost(): void;
  time(time: number): void;
}

/** Everything a scene starts from: `RunOptions` without its callbacks. */
type SceneStart = Omit<RunOptions, "onReady" | "onLost" | "onTime">;

/** The design's fade in. */
const FADE = "opacity 1.6s ease";

function supportsWorkerCanvas(): boolean {
  return (
    typeof Worker === "function" &&
    typeof HTMLCanvasElement.prototype.transferControlToOffscreen === "function"
  );
}

/**
 * Draws the scene in a worker (prompts/film-strip-background.md, decision 7),
 * so hydration, scrolling and input never wait on a frame. Throws when the
 * browser refuses the worker, and the caller then tries the main thread.
 */
function startInWorker(
  canvas: HTMLCanvasElement,
  start: SceneStart,
  events: SceneEvents,
): Controller {
  const offscreen = canvas.transferControlToOffscreen();
  const worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
    name: "film-scene",
  });
  const post = (message: ToWorker, transfer: Transferable[] = []) =>
    worker.postMessage(message, transfer);
  worker.onmessage = (event: MessageEvent<FromWorker>) => {
    const message = event.data;
    if (message.type === "time") events.time(message.time);
    else if (message.type === "ready") events.ready();
    else if (message.type === "lost") events.lost();
    else events.failed();
  };
  worker.onerror = () => events.failed();
  post({ type: "init", canvas: offscreen, ...start }, [offscreen]);
  return {
    resize: (width, height, pixelRatio) =>
      post({ type: "resize", width, height, pixelRatio }),
    visible: (visible) => post({ type: "visible", visible }),
    motion: (reduced) => post({ type: "motion", reduced }),
    dispose: () => worker.terminate(),
  };
}

/**
 * Draws the scene on the main thread, where no worker can (Safari 16 has
 * `OffscreenCanvas` but no WebGL on it). The scene chunk is loaded only here.
 * Resolves to null when nothing can draw, after reporting `lost`, or when
 * `isCurrent` says the start was replaced while the chunk loaded.
 */
async function startOnMainThread(
  canvas: HTMLCanvasElement,
  start: () => SceneStart,
  events: SceneEvents,
  isCurrent: () => boolean,
): Promise<Controller | null> {
  let runScene: typeof import("./run").runScene;
  try {
    ({ runScene } = await import("./run"));
  } catch {
    events.lost();
    return null;
  }
  if (!isCurrent()) return null;
  const clock = runScene(canvas, {
    ...start(),
    onReady: events.ready,
    onLost: events.lost,
    onTime: events.time,
  });
  if (!clock) {
    events.lost();
    return null;
  }
  return {
    resize: clock.resize,
    visible: clock.setVisible,
    motion: clock.setReducedMotion,
    dispose: clock.dispose,
  };
}

/**
 * Starts the film strip scene inside `host` and returns its cleanup
 * (prompts/film-strip-background.md, decisions 6 to 10).
 *
 * The canvas is created here rather than rendered by React: once its control
 * is transferred to a worker it can never be transferred again, so a canvas
 * React kept across a Strict Mode remount would throw. Each start gets a
 * fresh one and the cleanup removes it.
 *
 * Draws in a worker where the browser can hand a canvas to one, and on the
 * main thread otherwise, or when the worker cannot draw (Safari 16 has
 * `OffscreenCanvas` but no WebGL on it). The scene chunk is loaded only on the
 * path that needs it. If neither can draw, the canvas is removed and the page
 * keeps its CSS gradient and vignette.
 *
 * The budget follows the viewport (decision 8): a resize across the compact
 * breakpoint rebuilds the scene at the other density, because its geometry is
 * uploaded once. A resize within one budget only resizes the canvas, which
 * also places the strips again for the new shape.
 *
 * Nothing follows the pointer: the design's cursor parallax was dropped at
 * the owner's request, so no pointer listener is added at all.
 *
 * The canvas stays transparent until the first frame is drawn, then fades in,
 * except under reduced motion, where it appears without a transition.
 *
 * The intro plays once per tab (prompts/film-scene-continuity.md): the clock's
 * reports are kept in sessionStorage, and a later full load, or a rebuild
 * across the breakpoint, starts from the last one and appears without the
 * fade.
 *
 * `still` draws the reduced motion frame whatever the visitor's setting, so
 * `/showcase` can show it beside the live background. It neither reads nor
 * saves the stored time, so the preview never moves the live scene's clock.
 */
export function startFilmScene(
  host: HTMLElement,
  { still = false }: { still?: boolean } = {},
): () => void {
  const palette = readScenePalette(host);
  if (!palette) return () => {};

  const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  const reducedMotion = () => still || motionQuery.matches;
  const coarseQuery = matchMedia("(pointer: coarse)");
  const currentBudget = () =>
    chooseBudget({
      viewportWidth: innerWidth,
      coarsePointer: coarseQuery.matches,
      devicePixelRatio,
    });

  const stored = still ? null : readSceneTime();
  // The latest time the clock reported, the start of any rebuild.
  let time = stored ?? 0;
  // Whether this canvas carries on from an earlier one, so it skips the fade.
  let resuming = stored !== null;
  const onTime = (next: number) => {
    time = next;
    if (!still) saveSceneTime(next);
  };

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
  const state = (): SceneStart => ({
    ...size(),
    budget,
    palette,
    reducedMotion: reducedMotion(),
    visible: !document.hidden,
    time,
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
    canvas.style.transition = reducedMotion() || resuming ? "none" : FADE;
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
    if (!disposed) void start();
  };

  // A context lost after drawing is not retried anywhere (decision 7): a GPU
  // reset or memory pressure would only take the next one away too.
  const giveUp = () => {
    teardown();
    stopped = true;
  };

  /** Callbacks for one start, ignored once its scene has been replaced. */
  const eventsFor = (own: number): SceneEvents => {
    const live =
      <A extends unknown[]>(callback: (...args: A) => void) =>
      (...args: A) => {
        if (own === run) callback(...args);
      };
    return {
      ready: live(reveal),
      failed: live(fallBack),
      lost: live(giveUp),
      time: live(onTime),
    };
  };

  async function start() {
    run += 1;
    const own = run;
    const events = eventsFor(own);
    if (workerUsable) {
      try {
        controller = startInWorker(freshCanvas(), state(), events);
      } catch {
        fallBack();
      }
      return;
    }
    const next = await startOnMainThread(
      freshCanvas(),
      state,
      events,
      () => !disposed && own === run,
    );
    if (next && own === run) controller = next;
    else next?.dispose();
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
      resuming = true;
      void start();
      return;
    }
    const { width, height } = size();
    controller?.resize(width, height, budget.pixelRatio);
  });

  const onVisibility = () => controller?.visible(!document.hidden);
  const onMotion = () => controller?.motion(reducedMotion());

  void start();

  resizeObserver.observe(host);
  document.addEventListener("visibilitychange", onVisibility);
  motionQuery.addEventListener("change", onMotion);

  return () => {
    disposed = true;
    run += 1;
    resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    motionQuery.removeEventListener("change", onMotion);
    teardown();
  };
}
