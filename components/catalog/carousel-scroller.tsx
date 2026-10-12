"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

/** How far one press scrolls, as a share of the row's visible width (AC-6). */
const SCROLL_STEP = 0.9;

/**
 * A row's header and its sideways scroll area, so one client component owns
 * both ends of the arrow buttons (spec 0021, AC-5, AC-6).
 *
 * The scroll area is a focusable, labelled region: a keyboard user tabs to it
 * and scrolls with the arrow keys, and touch and trackpad scroll it natively,
 * with or without this component's script. The two buttons show from `md`
 * and start disabled, so before hydration (or with the bundle failing) they
 * are inert while the row still scrolls. After that, each is enabled only
 * while the row can move its way, measured on scroll and whenever the row or
 * its streamed cards change size.
 *
 * It holds no data and reads no session: the header pieces and the cards are
 * Server Components passed in.
 */
function CarouselScroller({
  label,
  heading,
  seeAll,
  children,
}: {
  /** The row title, naming the region and the buttons. */
  label: string;
  heading: React.ReactNode;
  seeAll: React.ReactNode;
  children: React.ReactNode;
}) {
  const regionRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const measure = useCallback(() => {
    const region = regionRef.current;
    if (!region) return;
    setCanGoBack(region.scrollLeft > 1);
    setCanGoForward(
      region.scrollLeft + region.clientWidth < region.scrollWidth - 1,
    );
  }, []);

  useEffect(() => {
    const region = regionRef.current;
    const content = contentRef.current;
    if (!region || !content) return;

    measure();
    region.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(region);
    observer.observe(content);
    return () => {
      region.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure]);

  function scroll(direction: -1 | 1) {
    const region = regionRef.current;
    if (!region) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    region.scrollBy({
      left: direction * region.clientWidth * SCROLL_STEP,
      behavior: reduced ? "instant" : "smooth",
    });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        {heading}
        <div className="flex shrink-0 items-center gap-3">
          {seeAll}
          <div className="hidden items-center gap-2 md:flex">
            <Button
              size="icon-bar"
              aria-label={`Scroll ${label} back`}
              disabled={!canGoBack}
              onClick={() => scroll(-1)}
            >
              <ChevronLeftIcon className="size-5" aria-hidden="true" />
            </Button>
            <Button
              size="icon-bar"
              aria-label={`Scroll ${label} forward`}
              disabled={!canGoForward}
              onClick={() => scroll(1)}
            >
              <ChevronRightIcon className="size-5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>

      <section
        ref={regionRef}
        aria-label={label}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable so keyboard users can scroll it (WCAG 2.1.1).
        tabIndex={0}
        data-slot="carousel-region"
        className="-mx-4 snap-x snap-mandatory scroll-px-4 overflow-x-auto overscroll-x-contain px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div ref={contentRef} className="w-max min-w-full">
          {children}
        </div>
      </section>
    </>
  );
}

export { CarouselScroller };
