"use client";

import type * as React from "react";
import { useEffect, useRef } from "react";

import { type Lean, REDUCED_MOTION, startMotionLoop } from "@/lib/motion/loop";

/** Tailwind's `md` and `lg`, where the layouts and the columns change. */
const WIDE = "(min-width: 48rem)";
const LARGE = "(min-width: 64rem)";
const FINE_POINTER = "(pointer: fine)";

/**
 * How far an Upcoming / On the air row slides per pixel the section moves
 * (prompts/home-parallax-landing.md, decision 13, amended 2026-10-18).
 * Neighbouring rows go opposite ways, so they part at twice this; 0.6 made the
 * cards blur past before they could be read.
 */
const MARQUEE_SPEED = 0.25;

/** How far a poster's artwork drifts inside its frame, in pixels. */
const POSTER_DRIFT = 24;

/**
 * Below `md` every distance shrinks with the screen, this width giving full
 * strength and `MIN_STRENGTH` the floor (prompts/mobile-landing-parallax.md,
 * decision 5).
 */
const FULL_STRENGTH_WIDTH = 1024;
const MIN_STRENGTH = 0.3;

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
 * The motion's strength: 1 from `md`, so tablets and desktops move exactly
 * as they did, and a share of it on a phone, so a drift measured for a
 * 1440px screen does not throw a 360px card across the page (decision 5).
 */
function strength(width: number, isWide: boolean): number {
  if (isWide) return 1;
  return Math.min(1, Math.max(MIN_STRENGTH, width / FULL_STRENGTH_WIDTH));
}

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
 * The landing's motion (prompts/home-parallax-landing.md, decisions 9, 14
 * and 16; prompts/mobile-landing-parallax.md): one idle aware
 * `requestAnimationFrame` loop (`startMotionLoop`) that writes transforms to
 * the `data-*` marked nodes the Server Components render. It holds no data
 * and renders nothing of its own, so every card, link and heading stays
 * server HTML that works with this script missing.
 *
 * - `data-depth`: the background blobs, moved by scroll and, with a mouse,
 *   by the pointer. Half depth below `md`.
 * - `data-hero-bg`, `data-hero-fg`, `data-hero-cue`: the hero's backdrop
 *   drifts, its text rises and fades, the scroll cue fades.
 * - `data-pin` with `data-pin-track` and `data-pin-bar`: the pinned row's
 *   sideways pan and progress bar.
 * - `data-speed`: a vertical drift against the centre of the viewport,
 *   measured from the nearest `data-speed-root` or the parent. A node whose
 *   column count changes carries its speed for that layout too:
 *   `data-speed-narrow` below `md` and `data-speed-lg` from `lg`
 *   (prompts/top-rated-parallax-columns.md, decision 3).
 * - `data-marquee`: a row that slides sideways as it crosses the viewport;
 *   while a card in it has focus, the row holds that card in view instead.
 * - `data-poster-drift`: the artwork drifts inside its frame, through the
 *   `poster-drift` utility's custom properties, so the image `next/image`
 *   renders is never written to.
 *
 * Everything runs at every width; below `md` the distances shrink with the
 * screen (`strength`). Each frame reads every box first and writes after,
 * so a frame lays the page out once. The streamed sections can arrive and be
 * moved before React hydrates them, so every node written here carries
 * `suppressHydrationWarning`: the only attribute that differs is the `style`
 * this loop owns. Reduced motion stops the loop and puts every node back, so
 * the page is a static layout with native swipe rows (AC-7).
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

    const reduced = window.matchMedia(REDUCED_MOTION);
    const wide = window.matchMedia(WIDE);
    const large = window.matchMedia(LARGE);
    const finePointer = window.matchMedia(FINE_POINTER);
    let lastViewport = window.innerHeight;

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

    function speedOf(node: HTMLElement, isWide: boolean): number {
      const own = !isWide
        ? node.dataset.speedNarrow
        : large.matches
          ? node.dataset.speedLg
          : undefined;
      return Number(own ?? node.dataset.speed);
    }

    function tick(_now: number, lean: Lean, viewport: number) {
      lastViewport = viewport;
      const scroll = window.scrollY;
      const isWide = wide.matches;
      const power = strength(window.innerWidth, isWide);
      const visible = (rect: DOMRect) =>
        rect.bottom > -100 && rect.top < viewport + 100;
      const writes: Array<() => void> = [];

      for (const node of all("[data-depth]")) {
        const depth = Number(node.dataset.depth) * (isWide ? 1 : 0.5);
        const transform = `translate3d(${-lean.x * depth * 80}px, ${
          -scroll * depth - lean.y * depth * 40
        }px, 0)`;
        writes.push(() => {
          node.style.transform = transform;
        });
      }

      if (scroll < viewport * 1.5) {
        for (const node of all("[data-hero-bg]")) {
          const transform = `translate3d(${-lean.x * 14}px, ${
            scroll * 0.45
          }px, 0)`;
          writes.push(() => {
            node.style.transform = transform;
          });
        }
        for (const node of all("[data-hero-fg]")) {
          const opacity = String(1 - clamp01(scroll / (viewport * 0.55)));
          writes.push(() => {
            node.style.transform = `translate3d(0, ${-scroll * 0.25}px, 0)`;
            node.style.opacity = opacity;
          });
        }
        for (const node of all("[data-hero-cue]")) {
          const opacity = String(1 - clamp01(scroll / 150));
          writes.push(() => {
            node.style.opacity = opacity;
          });
        }
      }

      for (const section of all("[data-pin]")) {
        const rect = section.getBoundingClientRect();
        if (!visible(rect)) continue;
        const progress = clamp01(-rect.top / (rect.height - viewport));
        const track = section.querySelector<HTMLElement>("[data-pin-track]");
        if (track?.parentElement) {
          const distance = travel(track, track.parentElement);
          writes.push(() => {
            track.style.transform = `translate3d(${-progress * distance}px, 0, 0)`;
          });
        }
        const bar = section.querySelector<HTMLElement>("[data-pin-bar]");
        if (bar) {
          writes.push(() => {
            bar.style.transform = `scaleX(${progress})`;
          });
        }
      }

      for (const node of all("[data-speed]")) {
        const reference =
          node.closest<HTMLElement>("[data-speed-root]") ?? node.parentElement;
        if (!reference) continue;
        const rect = reference.getBoundingClientRect();
        if (!visible(rect)) continue;
        const offset = rect.top + rect.height / 2 - viewport / 2;
        const y = -offset * speedOf(node, isWide) * power;
        writes.push(() => {
          node.style.transform = `translate3d(0, ${y}px, 0)`;
        });
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
              MARQUEE_SPEED *
              power;
        const clamped = Math.min(0, Math.max(min, x));
        writes.push(() => {
          row.style.transform = `translate3d(${clamped}px, 0, 0)`;
        });
      }

      const drift = POSTER_DRIFT * power;
      let index = 0;
      for (const card of all("[data-poster-drift]")) {
        index += 1;
        const rect = card.getBoundingClientRect();
        if (!visible(rect) || rect.height === 0) continue;
        const progress = (rect.top + rect.height / 2 - viewport / 2) / viewport;
        const direction = index % 2 ? -1 : 1;
        const y = `${direction * progress * drift}px`;
        const scale = String(1 + (2 * drift) / rect.height);
        writes.push(() => {
          card.style.setProperty("--poster-drift-y", y);
          card.style.setProperty("--poster-drift-scale", scale);
        });
      }

      for (const write of writes) write();
    }

    /*
     * A card tabbed to inside the pinned row could sit off screen, because
     * the row moves with the page's scroll. Scroll the page to the point of
     * the pin that shows it (decision 14). `overflow-x: clip` on the row's
     * frame keeps the browser from scrolling the frame itself instead.
     */
    function onFocusIn(event: FocusEvent) {
      if (reduced.matches) return;
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
        top: top + progress * (section.offsetHeight - lastViewport),
        behavior: "instant",
      });
    }

    const stop = startMotionLoop({
      tick,
      reset,
      restartOn: [wide],
      leans: () => finePointer.matches,
      idle: true,
      watch: root,
    });
    root.addEventListener("focusin", onFocusIn);

    return () => {
      stop();
      root.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  return (
    <div ref={rootRef} className={className}>
      {children}
    </div>
  );
}

export { LARGE, LandingParallax, WIDE };
