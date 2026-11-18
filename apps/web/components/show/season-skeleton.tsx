import { cn } from "cn";

import { Skeleton } from "@/components/skeleton";

/**
 * A season page while TMDB answers (spec 0009, AC-17): the back link, the
 * compact header, and a few episode rows at their footprint.
 *
 * Each piece copies the layout classes of what replaces it (`SeasonHeader`,
 * `EpisodeRow`), and each text line sits in a box one line of the real type
 * tall (`h-[1lh]`), so swapping one for the other moves nothing but the
 * episode count, which is unknown until TMDB answers
 * (prompts/grid-tabs-footer-legend.md).
 */
function SeasonSkeleton() {
  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <p role="status" className="sr-only">
        Loading season
      </p>
      <div className="flex flex-col gap-6">
        <div className="flex min-h-11 items-center md:min-h-9">
          <Skeleton shape="line" className="h-5 w-40" />
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 md:grid-rows-[auto_1fr] md:gap-x-8">
          <Skeleton
            shape="poster"
            className="col-start-1 row-start-1 w-24 shrink-0 self-start md:row-span-2 md:w-40"
          />
          <div className="col-start-2 row-start-1 flex min-w-0 flex-col gap-2 self-center md:gap-3 md:self-end">
            <Line className="text-sm md:text-base" width="w-1/3" />
            <Line
              className="text-2xl leading-tight md:text-4xl"
              width="w-2/3"
            />
            <Line className="text-sm" width="w-1/2" />
            {/* The tracking row: the season control and its progress. */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Skeleton shape="pill" className="h-11 w-44 md:h-9" />
              <Skeleton shape="line" className="w-32" />
            </div>
          </div>
          <div className="col-span-2 mt-4 flex max-w-[65ch] flex-col text-base leading-relaxed md:col-span-1 md:col-start-2 md:row-start-2 md:mt-3">
            <Line width="w-full" />
            <Line width="w-full" />
            <Line width="w-2/3" />
          </div>
        </div>
      </div>
      <div className="flex flex-col divide-y divide-border border-y border-border">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
            key={index}
            className="flex flex-col gap-4 py-6 md:flex-row md:gap-6"
          >
            <Skeleton
              shape="line"
              className="aspect-video h-auto w-full shrink-0 self-start rounded-lg md:w-60"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Line className="text-xs" width="w-24" />
              <Line className="text-lg leading-snug md:text-xl" width="w-1/2" />
              <Line className="text-sm" width="w-40" />
              <Skeleton shape="pill" className="w-28" />
              <div className="flex max-w-[65ch] flex-col text-[15px] leading-relaxed">
                <Line width="w-full" />
                <Line width="w-full" />
                <Line width="w-2/3" />
              </div>
              <div className="flex gap-2 pt-1">
                <Skeleton shape="pill" className="h-11 w-36 md:h-9" />
                <Skeleton shape="pill" className="h-11 w-24 md:h-9" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One line of text in the type its parent or `className` sets. */
function Line({ className, width }: { className?: string; width: string }) {
  return (
    <div className={cn("flex h-[1lh] items-center", className)}>
      <Skeleton shape="line" className={cn("h-[0.7lh]", width)} />
    </div>
  );
}

export { SeasonSkeleton };
