"use client";

import { useEffect, useRef } from "react";

/** How long to wait for an idle moment before starting anyway. */
const IDLE_TIMEOUT_MS = 2000;

/**
 * Runs `callback` once the browser is idle after hydration, or after a short
 * timer where `requestIdleCallback` is missing (Safari). Returns a canceller.
 */
function whenIdle(callback: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(callback, 200);
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
 */
export function AmbientCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    const cancelIdle = whenIdle(() => {
      import("@/lib/backdrop/mount")
        .then(({ mountBackdrop }) => {
          if (!cancelled) cleanup = mountBackdrop(host);
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
  }, []);

  return <div ref={hostRef} className="absolute inset-0" />;
}
