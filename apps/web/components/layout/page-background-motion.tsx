"use client";

import type * as React from "react";
import { useEffect, useRef } from "react";

import { startMotionLoop } from "@/lib/motion/loop";

/** The pinstripe's period along either axis: 14px across a 135° line. */
const STRIPE_PERIOD = 14 * Math.SQRT2;

const MOVED = "[data-page-bg],[data-page-blob],[data-page-stripes]";

/**
 * The page background's motion (prompts/warm-page-background.md, decision
 * 4): one `requestAnimationFrame` loop (`startMotionLoop`) that writes transforms to the
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

    const all = (selector: string) =>
      root.querySelectorAll<HTMLElement>(selector);

    return startMotionLoop({
      reset() {
        for (const node of all(MOVED)) node.style.transform = "";
      },
      tick(now, lean, viewport) {
        const time = now / 1000;
        const scroll = window.scrollY;
        const progress =
          scroll /
          Math.max(1, document.documentElement.scrollHeight - viewport);

        for (const node of all("[data-page-bg]")) {
          node.style.transform = `translate3d(${-lean.x * 10}px, ${
            -progress * viewport * 0.3
          }px, 0)`;
        }

        for (const node of all("[data-page-blob]")) {
          const [depth, phase, index] = (node.dataset.pageBlob ?? "")
            .split(",")
            .map(Number);
          const x = Math.sin(time * 0.13 + phase) * 60 - lean.x * depth * 200;
          const y =
            Math.cos(time * 0.11 + phase) * 50 -
            progress * viewport * depth * 2.5 -
            lean.y * depth * 120;
          const scale = 1 + Math.sin(time * 0.09 + index) * 0.06;
          node.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
        }

        for (const node of all("[data-page-stripes]")) {
          node.style.transform = `translate3d(${
            (-lean.x * 24) % STRIPE_PERIOD
          }px, ${-((scroll * 0.18) % STRIPE_PERIOD)}px, 0)`;
        }
      },
    });
  }, []);

  return (
    <div ref={rootRef} aria-hidden="true" className={className}>
      {children}
    </div>
  );
}

export { PageBackgroundMotion };
