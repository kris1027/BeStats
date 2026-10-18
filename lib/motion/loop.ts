/** The query that stops every motion loop on the site (AC-7 of each plan). */
export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** How much of the gap to the pointer the lean closes each frame. */
const LEAN_EASE = 0.06;

/** The eased mouse position, -1 to 1 across and down the viewport. */
export type Lean = Readonly<{ x: number; y: number }>;

/**
 * One `requestAnimationFrame` loop for a page's decorative motion: the
 * landing's parallax and the page background each pass only what they move
 * (prompts/landing-review-fixes.md, decision 8), so the rules every loop
 * keeps live in one place:
 *
 * - Under reduced motion it never runs, and turning the setting on live
 *   stops it and calls `reset`, so the page is its static server layout.
 *   A change of any `restartOn` query restarts it the same way.
 * - Only a mouse leans the motion (`pointerType`); touch and pen move
 *   nothing. `leans` can turn the lean off, which eases it back to rest.
 * - The browser pauses it in a hidden tab, as it does every frame callback.
 *
 * Browser only: call it from an effect.
 *
 * @returns The cleanup that stops the loop and removes every listener.
 */
export function startMotionLoop({
  tick,
  reset,
  restartOn = [],
  leans = () => true,
}: {
  /** Writes one frame, from the frame time and the eased lean. */
  tick: (now: number, lean: Lean) => void;
  /** Puts every node the loop writes back to its server styles. */
  reset: () => void;
  restartOn?: readonly MediaQueryList[];
  leans?: () => boolean;
}): () => void {
  const reduced = window.matchMedia(REDUCED_MOTION);
  const queries = [reduced, ...restartOn];
  const pointer = { x: 0, y: 0 };
  const lean = { x: 0, y: 0 };
  let frame = 0;

  function loop(now: number) {
    const active = leans();
    lean.x += ((active ? pointer.x : 0) - lean.x) * LEAN_EASE;
    lean.y += ((active ? pointer.y : 0) - lean.y) * LEAN_EASE;
    tick(now, lean);
    frame = window.requestAnimationFrame(loop);
  }

  function start() {
    window.cancelAnimationFrame(frame);
    reset();
    if (!reduced.matches) frame = window.requestAnimationFrame(loop);
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  }

  start();
  for (const query of queries) query.addEventListener("change", start);
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  return () => {
    window.cancelAnimationFrame(frame);
    for (const query of queries) query.removeEventListener("change", start);
    window.removeEventListener("pointermove", onPointerMove);
  };
}
