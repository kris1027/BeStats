"use client";

import type * as React from "react";
import { useEffect, useRef } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";
const WIDE = "(min-width: 48rem)";
const FINE_POINTER = "(pointer: fine)";

/** How far a poster's artwork drifts inside its frame, in pixels. */
const POSTER_DRIFT = 24;

/** Every node this component may move, so a reset can put each one back. */
const MOVED = [
  "[data-depth]",
  "[data-hero-bg]",
  "[data-hero-fg]",
  "[data-hero-cue]",
  "[data-pin-track]",
  "[data-pin-bar]",
  "[data-speed]",
  "[data-marquee]",
  "[data-poster-drift]",
].join(",");

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * How far a sideways row can travel inside its frame: the row's width plus
 * the frame's own padding, less what the frame shows.
 */
function travel(row: HTMLElement, frame: HTMLElement): number {
  const style = window.getComputedStyle(frame);
  const padding =
    Number.parseFloat(style.paddingLeft) +
    Number.parseFloat(style.paddingRight);
  return Math.max(0, row.scrollWidth + padding - frame.clientWidth);
}

/**
 * Where an item sits along its row, measured from the row's start. Both
 * boxes carry the row's transform, so their difference is the untransformed
 * position whatever the row's `offsetParent` is.
 */
function centreAlong(item: HTMLElement, row: HTMLElement): number {
  const box = item.getBoundingClientRect();
  return box.left + box.width / 2 - row.getBoundingClientRect().left;
}

/**
 * The landing's motion (prompts/home-parallax-landing.md, decisions 6, 9,
 * 14 and 16): one `requestAnimationFrame` loop that writes transforms to the
 * `data-*` marked nodes the Server Components render. It holds no data and
 * renders nothing of its own, so every card, link and heading stays server
 * HTML that works with this script missing.
 *
 * - `data-depth`: the background blobs, moved by scroll and, with a mouse,
 *   by the pointer. Half depth below `md`.
 * - `data-hero-bg`, `data-hero-fg`, `data-hero-cue`: the hero's backdrop
 *   drifts, its text rises and fades, the scroll cue fades.
 * - `data-pin` with `data-pin-track` and `data-pin-bar`: the pinned row's
 *   sideways pan and progress bar.
 * - `data-speed`: a vertical drift against the centre of the viewport,
 *   measured from the nearest `data-speed-root` or the parent.
 * - `data-marquee`: a row that slides sideways as it crosses the viewport;
 *   while a card in it has focus, the row holds that card in view instead.
 * - `data-poster-drift`: the artwork drifts inside its frame, through the
 *   `poster-drift` utility's custom properties, so the image `next/image`
 *   renders is never written to.
 *
 * The streamed sections can arrive and be moved before React hydrates them,
 * so every node written here carries `suppressHydrationWarning`: the only
 * attribute that differs is the `style` this loop owns.
 * Everything except the blobs and the hero runs only from `md`, where the
 * CSS lays the sections out for it. Reduced motion stops the loop and puts
 * every node back, so the page is a static layout (AC-7).
 */
function LandingParallax({
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
    const wide = window.matchMedia(WIDE);
    const finePointer = window.matchMedia(FINE_POINTER);

    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;
    let easedX = 0;
    let easedY = 0;

    const all = <T extends Element = HTMLElement>(selector: string) =>
      root.querySelectorAll<T & HTMLElement>(selector);

    function reset() {
      for (const node of all(MOVED)) {
        node.style.transform = "";
        node.style.opacity = "";
        node.style.removeProperty("--poster-drift-y");
        node.style.removeProperty("--poster-drift-scale");
      }
    }

    function tick() {
      const scroll = window.scrollY;
      const viewport = window.innerHeight;
      const isWide = wide.matches;
      const visible = (rect: DOMRect) =>
        rect.bottom > -100 && rect.top < viewport + 100;

      easedX += ((finePointer.matches ? pointerX : 0) - easedX) * 0.06;
      easedY += ((finePointer.matches ? pointerY : 0) - easedY) * 0.06;

      for (const node of all("[data-depth]")) {
        const depth = Number(node.dataset.depth) * (isWide ? 1 : 0.5);
        node.style.transform = `translate3d(${-easedX * depth * 80}px, ${
          -scroll * depth - easedY * depth * 40
        }px, 0)`;
      }

      if (scroll < viewport * 1.5) {
        for (const node of all("[data-hero-bg]")) {
          node.style.transform = `translate3d(${-easedX * 14}px, ${
            scroll * 0.45
          }px, 0)`;
        }
        for (const node of all("[data-hero-fg]")) {
          node.style.transform = `translate3d(0, ${-scroll * 0.25}px, 0)`;
          node.style.opacity = String(1 - clamp01(scroll / (viewport * 0.55)));
        }
        for (const node of all("[data-hero-cue]")) {
          node.style.opacity = String(1 - clamp01(scroll / 150));
        }
      }

      if (!isWide) return;

      for (const section of all("[data-pin]")) {
        const rect = section.getBoundingClientRect();
        if (!visible(rect)) continue;
        const progress = clamp01(-rect.top / (rect.height - viewport));
        const track = section.querySelector<HTMLElement>("[data-pin-track]");
        if (track?.parentElement) {
          const distance = travel(track, track.parentElement);
          track.style.transform = `translate3d(${-progress * distance}px, 0, 0)`;
        }
        const bar = section.querySelector<HTMLElement>("[data-pin-bar]");
        if (bar) bar.style.transform = `scaleX(${progress})`;
      }

      for (const node of all("[data-speed]")) {
        const reference =
          node.closest<HTMLElement>("[data-speed-root]") ?? node.parentElement;
        if (!reference) continue;
        const rect = reference.getBoundingClientRect();
        if (!visible(rect)) continue;
        const offset = rect.top + rect.height / 2 - viewport / 2;
        node.style.transform = `translate3d(0, ${
          -offset * Number(node.dataset.speed)
        }px, 0)`;
      }

      for (const row of all("[data-marquee]")) {
        const frameNode = row.parentElement;
        if (!frameNode) continue;
        const rect = frameNode.getBoundingClientRect();
        if (!visible(rect)) continue;
        const min = -travel(row, frameNode);
        const focused =
          document.activeElement instanceof HTMLElement &&
          row.contains(document.activeElement)
            ? document.activeElement.closest("li")
            : null;
        const x = focused
          ? frameNode.clientWidth / 2 - centreAlong(focused, row)
          : min / 2 +
            Number(row.dataset.marquee) *
              (rect.top + rect.height / 2 - viewport / 2) *
              0.6;
        row.style.transform = `translate3d(${Math.min(0, Math.max(min, x))}px, 0, 0)`;
      }

      let index = 0;
      for (const card of all("[data-poster-drift]")) {
        index += 1;
        const rect = card.getBoundingClientRect();
        if (!visible(rect) || rect.height === 0) continue;
        const progress = (rect.top + rect.height / 2 - viewport / 2) / viewport;
        const direction = index % 2 ? -1 : 1;
        card.style.setProperty(
          "--poster-drift-y",
          `${direction * progress * POSTER_DRIFT}px`,
        );
        card.style.setProperty(
          "--poster-drift-scale",
          String(1 + (2 * POSTER_DRIFT) / rect.height),
        );
      }
    }

    function loop() {
      tick();
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

    /*
     * A card tabbed to inside the pinned row could sit off screen, because
     * the row moves with the page's scroll. Scroll the page to the point of
     * the pin that shows it (decision 14). `overflow-x: clip` on the row's
     * frame keeps the browser from scrolling the frame itself instead.
     */
    function onFocusIn(event: FocusEvent) {
      if (reduced.matches || !wide.matches) return;
      const target = event.target instanceof Element ? event.target : null;
      const track = target?.closest<HTMLElement>("[data-pin-track]");
      const section = track?.closest<HTMLElement>("[data-pin]");
      const item = target?.closest<HTMLElement>("li");
      if (!track?.parentElement || !section || !item) return;
      const distance = travel(track, track.parentElement);
      if (distance <= 0) return;
      const progress = clamp01(
        (centreAlong(item, track) - track.parentElement.clientWidth / 2) /
          distance,
      );
      const top = section.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: top + progress * (section.offsetHeight - window.innerHeight),
        behavior: "instant",
      });
    }

    start();
    reduced.addEventListener("change", start);
    wide.addEventListener("change", start);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    root.addEventListener("focusin", onFocusIn);

    return () => {
      window.cancelAnimationFrame(frame);
      reduced.removeEventListener("change", start);
      wide.removeEventListener("change", start);
      window.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  return (
    <div ref={rootRef} className={className}>
      {children}
    </div>
  );
}

export { LandingParallax };
