import type { SceneClock } from "./clock";
import { type FromWorker, toWorkerSchema } from "./messages";
import { runScene } from "./run";

/**
 * The background's worker entry (prompts/film-strip-background.md,
 * decision 7).
 *
 * The canvas arrives as an `OffscreenCanvas` in the `init` message and every
 * frame is drawn here, so React hydration, scrolling and input on the main
 * thread never wait on the animation, nor it on them. A message that fails
 * validation is dropped. There is no dispose message: the page terminates
 * the worker, which releases the context and everything else at once.
 *
 * `rebuild` swaps the scene for one at the new budget on the fresh canvas it
 * brings, starting from the time the old clock reported as it stopped, so
 * the strips carry on from their exact pose (prompts/film-scene-continuity.md,
 * AC-3).
 */

/** The slice of `DedicatedWorkerGlobalScope` this file uses. */
interface WorkerScope {
  postMessage(message: FromWorker): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
}

const scope = self as unknown as WorkerScope;
let clock: SceneClock | null = null;
// The clock's latest report, where a rebuilt scene starts.
let latest = 0;

const callbacks = {
  onReady: () => scope.postMessage({ type: "ready" }),
  onTime: (time: number) => {
    latest = time;
    scope.postMessage({ type: "time", time });
  },
  onLost: () => {
    clock = null;
    scope.postMessage({ type: "lost" });
  },
};

scope.onmessage = (event) => {
  const parsed = toWorkerSchema.safeParse(event.data);
  if (!parsed.success) return;
  const message = parsed.data;

  switch (message.type) {
    case "init": {
      if (clock) return;
      latest = message.time;
      clock = runScene(message.canvas, { ...message, ...callbacks });
      if (!clock) scope.postMessage({ type: "failed" });
      return;
    }
    case "rebuild": {
      if (!clock) return;
      // Disposing stops the clock, which reports its time into `latest`.
      clock.dispose();
      clock = runScene(message.canvas, {
        ...message,
        time: latest,
        ...callbacks,
      });
      if (!clock) scope.postMessage({ type: "failed" });
      return;
    }
    case "resize":
      clock?.resize(message.width, message.height, message.pixelRatio);
      return;
    case "visible":
      clock?.setVisible(message.visible);
      return;
    case "motion":
      clock?.setReducedMotion(message.reduced);
      return;
  }
};
