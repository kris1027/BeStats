"use client";

import { useEffect, useRef } from "react";

/** How long to wait for an idle moment before starting anyway. */
const IDLE_TIMEOUT_MS = 2000;

/**
 * Where `requestIdleCallback` is missing (Safari), a short delay stands in
 * for it, long enough to let hydration's first tasks run before the import.
 */
const NO_IDLE_DELAY_MS = 200;

/**
 * Runs `callback` once the browser is idle after hydration, or after a short
 * timer where `requestIdleCallback` is missing (Safari). Returns a canceller.
 */
function whenIdle(callback: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(callback, NO_IDLE_DELAY_MS);
  return () => clearTimeout(handle);
}

/**
 * The animated layer of the ambient background
 * (prompts/ambient-background.md, decision 4).
 *
 * A client boundary that renders one empty `div` and reads no request state,
 * so every route keeps its prerendered shell. Nothing of the scene is in the
 * initial JavaScript: the mount module is imported when the browser is idle,
 * and it in turn loads either the worker or the renderer, whichever this
 * browser can use. Any failure on that path leaves the static vignette, which
 * is the page as it looked before this feature.
 *
 * `still` freezes it on the reduced motion frame for every visitor; only
 * `/showcase` passes it, to show that frame on demand.
 */
export function AmbientCanvas({ still = false }: { still?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    const cancelIdle = whenIdle(() => {
      import("@/lib/backdrop/mount")
        .then(({ mountBackdrop }) => {
          if (!cancelled) cleanup = mountBackdrop(host, { still });
        })
        .catch(() => {
          // The background is decoration; a failed chunk load is not an error
          // the visitor needs to see.
        });
    });

    return () => {
      cancelled = true;
      cancelIdle();
      cleanup?.();
    };
  }, [still]);

  return <div ref={hostRef} className="absolute inset-0" />;
}
