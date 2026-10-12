import { cn } from "cn";

import { ROW_ITEM_CLASS } from "@/components/catalog/carousel-row-states";
import { PosterCardSkeleton, Skeleton } from "@/components/skeleton";

/**
 * The `DetailHero` while TMDB answers, at its footprint (spec 0006, AC-11;
 * spec 0009, AC-17): the backdrop, then the poster beside the title and meta
 * lines.
 *
 * It assumes a backdrop, which most titles have. A title without one
 * collapses upwards when it arrives, which is a smaller jump than reserving no
 * space for the common case.
 */
function DetailHeroSkeleton({ metaRows = 1 }: { metaRows?: 1 | 2 }) {
  return (
    <div className="flex flex-col">
      <Skeleton
        shape="line"
        className="-mx-4 -mt-[calc(2rem+var(--navbar-height))] aspect-video h-auto w-auto max-h-[70vh] min-h-[calc(var(--navbar-height)+12rem)] rounded-none md:-mt-[calc(3rem+var(--navbar-height))]"
      />
      {/*
       * The same grid as `DetailHero`, so the info block lands where the
       * real one does at every width: under the poster on mobile, beside it
       * from `sm`. Each line sits in a box one line of the real type tall
       * (`h-[1lh]`), and each row of pills at the real row's height.
       */}
      <div className="relative z-10 -mt-10 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 sm:-mt-20 sm:grid-rows-[1fr_auto] md:-mt-40 md:gap-x-8">
        <Skeleton
          shape="poster"
          className="col-start-1 row-start-1 w-28 shrink-0 self-end sm:row-span-2 sm:w-40 md:w-60"
        />
        <div className="col-start-2 row-start-1 flex flex-col gap-2 self-end md:gap-3">
          <div className="flex h-[1lh] items-center text-2xl leading-tight sm:text-3xl md:text-5xl">
            <Skeleton shape="line" className="h-[0.8lh] w-3/4" />
          </div>
          <div className="flex h-[1lh] items-center text-sm md:text-lg">
            <Skeleton shape="line" className="h-[0.8lh] w-1/2" />
          </div>
        </div>
        <div className="col-span-2 mt-4 flex flex-col gap-3 sm:col-span-1 sm:col-start-2 sm:row-start-2 sm:mt-3">
          {Array.from({ length: metaRows }, (_, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
            <div key={index} className="flex gap-2">
              <Skeleton shape="pill" />
              <Skeleton shape="pill" />
              <Skeleton shape="pill" />
            </div>
          ))}
          <Skeleton shape="pill" className="w-40" />
          <Skeleton shape="pill" className="h-11 w-32 md:h-9" />
        </div>
      </div>
    </div>
  );
}

/**
 * The section heading every detail page section opens with, one line of its
 * `text-xl md:text-2xl leading-tight` type tall.
 */
function SectionHeadingSkeleton({ className }: { className?: string }) {
  return (
    <div className="flex h-[1lh] items-center text-xl leading-tight md:text-2xl">
      <Skeleton shape="line" className={cn("h-[0.8lh]", className)} />
    </div>
  );
}

/**
 * The overview: its heading and paragraph lines at the body's
 * `leading-relaxed` line height. Four lines from `md`, eight below it, the
 * length a typical TMDB overview wraps to at each width.
 */
function OverviewSkeleton() {
  return (
    <div className="flex max-w-[65ch] flex-col gap-3">
      <SectionHeadingSkeleton className="w-32" />
      <div className="flex flex-col text-base leading-relaxed">
        {OVERVIEW_LINES.map(({ visibility, width }, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
          <div key={index} className={cn("h-[1lh] items-center", visibility)}>
            <Skeleton shape="line" className={width} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The overview's lines: when each shows, and the shorter width that ends the
 * paragraph at that breakpoint (the fourth line from `md`, the eighth below).
 */
const OVERVIEW_LINES = [
  { visibility: "flex" },
  { visibility: "flex" },
  { visibility: "flex" },
  { visibility: "flex", width: "md:w-2/3" },
  { visibility: "flex md:hidden" },
  { visibility: "flex md:hidden" },
  { visibility: "flex md:hidden" },
  { visibility: "flex md:hidden", width: "w-2/3" },
];

/**
 * One row of cast cards at `CastRow`'s row card width, without a heading:
 * the 2:3 frame, the name line and the character line, as on a media card.
 * Inside the cast carousel it is the cards' fallback; on a page skeleton,
 * `CastRowSkeletonFrame` stands in for the carousel's scroll region.
 */
function CastRowSkeleton() {
  return (
    <ul aria-hidden="true" className="flex gap-3 md:gap-4">
      {Array.from({ length: 12 }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
        <li key={index} className={ROW_ITEM_CLASS}>
          <PosterCardSkeleton meta />
        </li>
      ))}
    </ul>
  );
}

/** The cast row skeleton clipped and padded like the carousel's region. */
function CastRowSkeletonFrame() {
  return (
    <div className="-mx-4 overflow-hidden px-4 pb-3">
      <CastRowSkeleton />
    </div>
  );
}

export {
  CastRowSkeleton,
  CastRowSkeletonFrame,
  DetailHeroSkeleton,
  OverviewSkeleton,
  SectionHeadingSkeleton,
};
