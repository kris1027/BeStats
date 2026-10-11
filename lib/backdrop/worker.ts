import { createBackdrop } from "./backdrop";
import type { BackdropLoop } from "./loop";
import { type FromWorker, toWorkerSchema } from "./protocol";

/**
 * The background's worker entry (prompts/ambient-background.md, decision 3).
 *
 * The canvas arrives as an `OffscreenCanvas` in the `init` message and every
 * frame is drawn here, so React hydration, scrolling and input on the main
 * thread never wait on the animation, nor it on them. A message that fails
 * validation is dropped.
 */

/** The slice of `DedicatedWorkerGlobalScope` this file uses. */
interface WorkerScope {
  postMessage(message: FromWorker): void;
  close(): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
}

const scope = self as unknown as WorkerScope;
let loop: BackdropLoop | null = null;

scope.onmessage = (event) => {
  const parsed = toWorkerSchema.safeParse(event.data);
  if (!parsed.success) return;
  const message = parsed.data;

  switch (message.type) {
    case "init": {
      if (loop) return;
      loop = createBackdrop(message.canvas, {
        ...message,
        onReady: () => scope.postMessage({ type: "ready" }),
        onFailed: () => {
          loop = null;
          scope.postMessage({ type: "failed" });
        },
      });
      if (!loop) scope.postMessage({ type: "failed" });
      return;
    }
    case "resize":
      loop?.resize(message.width, message.height, message.pixelRatio);
      return;
    case "pointer":
      loop?.setPointer(message.x, message.y);
      return;
    case "visible":
      loop?.setVisible(message.visible);
      return;
    case "motion":
      loop?.setReducedMotion(message.reduced);
      return;
    case "dispose":
      loop?.dispose();
      loop = null;
      scope.close();
      return;
  }
};
