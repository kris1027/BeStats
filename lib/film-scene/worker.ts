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
 */

/** The slice of `DedicatedWorkerGlobalScope` this file uses. */
interface WorkerScope {
  postMessage(message: FromWorker): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
}

const scope = self as unknown as WorkerScope;
let clock: SceneClock | null = null;

scope.onmessage = (event) => {
  const parsed = toWorkerSchema.safeParse(event.data);
  if (!parsed.success) return;
  const message = parsed.data;

  switch (message.type) {
    case "init": {
      if (clock) return;
      clock = runScene(message.canvas, {
        ...message,
        onReady: () => scope.postMessage({ type: "ready" }),
        onTime: (time) => scope.postMessage({ type: "time", time }),
        onLost: () => {
          clock = null;
          scope.postMessage({ type: "lost" });
        },
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
