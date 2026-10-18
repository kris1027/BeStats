"use client";

import type * as React from "react";
import { useEffect, useRef } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";

/** The pinstripe's period along either axis: 14px across a 135° line. */
const STRIPE_PERIOD = 14 * Math.SQRT2;

/** How much of the gap to the pointer the lean closes each frame. */
const EASE = 0.06;

const MOVED = "[data-page-bg],[data-page-blob],[data-page-stripes]";

/**
 * The page background's motion (prompts/warm-page-background.md, decision
 * 4): one `requestAnimationFrame` loop that writes transforms to the
 * `data-page-*` layers the Server Component renders inside it.
 *
 * - `data-page-bg`: the gradient slides up a little over the whole page.
 * - `data-page-blob="depth,phase,index"`: each blob drifts on its own slow
 *   orbit and pulse, and slides with scroll by its depth.
 * - `data-page-stripes`: the pinstripe moves modulo its period, so its
 *   edge, hidden in the bleed, never comes into view.
 *
 * Scroll is read as progress through the page, so a short page and a long
 * one move as far. Only a mouse leans the layers (`pointerType`); touch and
 * pen move nothing. The browser stops the loop in a hidden tab. Under reduced
 * motion it never runs, and switching the setting live puts every layer
 * back. It renders only its own wrapper, so the still background is the
 * server HTML and the first paint; the effect runs after hydration, so React
 * never compares the styles it writes.
 */
function PageBackgroundMotion({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced = window.matchMedia(REDUCED);
    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;
    let easedX = 0;
    let easedY = 0;

    const all = (selector: string) =>
      root.querySelectorAll<HTMLElement>(selector);

    function reset() {
      for (const node of all(MOVED)) node.style.transform = "";
    }

    function tick(now: number) {
      const time = now / 1000;
      const viewport = window.innerHeight;
      const scroll = window.scrollY;
      const progress =
        scroll / Math.max(1, document.documentElement.scrollHeight - viewport);

      easedX += (pointerX - easedX) * EASE;
      easedY += (pointerY - easedY) * EASE;

      for (const node of all("[data-page-bg]")) {
        node.style.transform = `translate3d(${-easedX * 10}px, ${
          -progress * viewport * 0.3
        }px, 0)`;
      }

      for (const node of all("[data-page-blob]")) {
        const [depth, phase, index] = (node.dataset.pageBlob ?? "")
          .split(",")
          .map(Number);
        const x = Math.sin(time * 0.13 + phase) * 60 - easedX * depth * 200;
        const y =
          Math.cos(time * 0.11 + phase) * 50 -
          progress * viewport * depth * 2.5 -
          easedY * depth * 120;
        const scale = 1 + Math.sin(time * 0.09 + index) * 0.06;
        node.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
      }

      for (const node of all("[data-page-stripes]")) {
        node.style.transform = `translate3d(${
          (-easedX * 24) % STRIPE_PERIOD
        }px, ${-((scroll * 0.18) % STRIPE_PERIOD)}px, 0)`;
      }
    }

    function loop(now: number) {
      tick(now);
      frame = window.requestAnimationFrame(loop);
    }

    function start() {
      window.cancelAnimationFrame(frame);
      reset();
      if (!reduced.matches) frame = window.requestAnimationFrame(loop);
    }

    function onPointerMove(event: PointerEvent) {
      if (event.pointerType !== "mouse") return;
      pointerX = (event.clientX / window.innerWidth) * 2 - 1;
      pointerY = (event.clientY / window.innerHeight) * 2 - 1;
    }

    start();
    reduced.addEventListener("change", start);
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      reduced.removeEventListener("change", start);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return (
    <div ref={rootRef} aria-hidden="true" className={className}>
      {children}
    </div>
  );
}

export { PageBackgroundMotion };
