/** The query that stops every motion loop on the site (AC-7 of each plan). */
export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** How much of the gap to the pointer the lean closes each frame. */
const LEAN_EASE = 0.06;

/** How close the lean must come to its target before an idle loop sleeps. */
const LEAN_REST = 0.001;

/** The eased mouse position, -1 to 1 across and down the viewport. */
export type Lean = Readonly<{ x: number; y: number }>;

/**
 * A fixed, invisible box one small viewport tall. Its height is the screen
 * with the browser's toolbars shown, which stays put while a phone's address
 * bar slides away, unlike `innerHeight` (prompts/mobile-landing-parallax.md,
 * decision 3). `100vh` first, for a browser without `svh`.
 */
function createViewportProbe(): HTMLElement {
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:100vh;visibility:hidden;pointer-events:none";
  probe.style.height = "100svh";
  document.body.append(probe);
  return probe;
}

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
 * - `tick` gets a viewport height that ignores a phone's address bar, read
 *   only on a resize or a turn, so positions never jump mid scroll
 *   (prompts/mobile-landing-parallax.md, decision 3).
 * - With `idle`, it draws only after a scroll, resize, mouse move, focus
 *   change or a node added under `idle.watch` (a streamed section), and
 *   while the lean is still easing, then sleeps (decision 4). A loop that animates over
 *   time, like the page background, leaves it off.
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
  idle,
}: {
  /** Writes one frame, from the frame time, the eased lean and the viewport. */
  tick: (now: number, lean: Lean, viewport: number) => void;
  /** Puts every node the loop writes back to its server styles. */
  reset: () => void;
  restartOn?: readonly MediaQueryList[];
  leans?: () => boolean;
  /** Sleep between changes; `watch` is the subtree whose added nodes wake it. */
  idle?: { watch?: Node };
}): () => void {
  const reduced = window.matchMedia(REDUCED_MOTION);
  const queries = [reduced, ...restartOn];
  const pointer = { x: 0, y: 0 };
  const lean = { x: 0, y: 0 };
  const probe = createViewportProbe();
  let viewport = 0;
  let frame = 0;

  function measure() {
    viewport = probe.offsetHeight || window.innerHeight;
  }

  function loop(now: number) {
    frame = 0;
    const active = leans();
    const targetX = active ? pointer.x : 0;
    const targetY = active ? pointer.y : 0;
    lean.x += (targetX - lean.x) * LEAN_EASE;
    lean.y += (targetY - lean.y) * LEAN_EASE;
    tick(now, lean, viewport);
    const settled =
      Math.abs(targetX - lean.x) < LEAN_REST &&
      Math.abs(targetY - lean.y) < LEAN_REST;
    if (!idle || !settled) wake();
  }

  function wake() {
    if (frame === 0 && !reduced.matches) {
      frame = window.requestAnimationFrame(loop);
    }
  }

  function start() {
    window.cancelAnimationFrame(frame);
    frame = 0;
    reset();
    wake();
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    if (idle) wake();
  }

  function onResize() {
    measure();
    wake();
  }

  const mutations = idle?.watch
    ? new MutationObserver(() => wake())
    : undefined;

  measure();
  start();
  for (const query of queries) query.addEventListener("change", start);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  if (idle) {
    window.addEventListener("scroll", wake, { passive: true });
    document.addEventListener("focusin", wake);
  }
  if (mutations && idle?.watch) {
    mutations.observe(idle.watch, { childList: true, subtree: true });
  }

  return () => {
    window.cancelAnimationFrame(frame);
    for (const query of queries) query.removeEventListener("change", start);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("orientationchange", onResize);
    window.removeEventListener("scroll", wake);
    document.removeEventListener("focusin", wake);
    mutations?.disconnect();
    probe.remove();
  };
}
