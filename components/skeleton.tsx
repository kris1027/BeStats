import { cn } from "cn";
import type * as React from "react";

/**
 * Loading placeholders shaped like the content they replace (spec 0004, AC-12).
 *
 * Each shape reuses the exact tokens its real component uses, so swapping the
 * skeleton for real content moves nothing on the page. `poster` mirrors
 * `PosterCard`'s 2:3 frame, `pill` mirrors `GlassPill`'s height and radius, and
 * `line` is a single caption row.
 *
 * The pulse is defined once in `globals.css` and is cut entirely under
 * `prefers-reduced-motion`, not merely slowed.
 */
const SHAPES = {
  poster: "aspect-2/3 w-full rounded-lg",
  pill: "h-7 w-16 rounded-full",
  line: "h-4 w-full rounded-sm",
} as const;

function Skeleton({
  shape,
  className,
  ...props
}: React.ComponentProps<"div"> & { shape: keyof typeof SHAPES }) {
  return (
    <div
      data-slot="skeleton"
      /*
       * Hidden from assistive technology: the surrounding Suspense boundary's
       * content is what gets announced when it arrives, and a screen reader
       * reading out a dozen empty boxes is noise, not information.
       */
      aria-hidden="true"
      /*
       * Flat plate plus rim, not the glass gradient. A skeleton should read as
       * an absence; the gradient stretched over a poster frame reads as
       * content, and the pulse then looks like something is happening rather
       * than something is missing.
       */
      className={cn(
        "plate-solid plate-rim glass-rim glass-plate skeleton-pulse",
        SHAPES[shape],
        className,
      )}
      {...props}
    />
  );
}

/**
 * The loading shape of one `PosterCard`, kept beside the card's real layout so
 * the two cannot drift apart.
 */
function PosterCardSkeleton({ meta = false }: { meta?: boolean }) {
  return (
    <div className="flex flex-col gap-2.5">
      <Skeleton shape="poster" />
      {/*
       * One line of the caption's own type tall (`h-[1lh]`), not a bare 16px
       * bar: a 20 card grid of 16px stand ins grows by a row's worth when the
       * 19px captions arrive. `meta` adds the season card's second line.
       */}
      <div className="flex h-[1lh] items-center text-sm leading-snug">
        <Skeleton shape="line" className="w-2/3" />
      </div>
      {meta ? (
        <div className="-mt-1.5 flex h-[1lh] items-center text-xs">
          <Skeleton shape="line" className="h-3 w-1/2" />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The stand in for `PaginationLinks` under a paged grid while it streams: one
 * pill at the links' height (the 44px `touch` size, 36px from `md`), so the
 * page does not grow by a row when the links arrive.
 */
function PaginationSkeleton() {
  return (
    <div className="flex items-center justify-center">
      <Skeleton shape="pill" className="h-11 w-56 md:h-9" />
    </div>
  );
}

export { PaginationSkeleton, PosterCardSkeleton, Skeleton };
