import { Skeleton } from "@/components/skeleton";

/**
 * A season page while TMDB answers (spec 0009, AC-17): the back link, the
 * compact header, and a few episode rows at their footprint.
 */
function SeasonSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <p role="status" className="sr-only">
        Loading season
      </p>
      <div className="flex flex-col gap-6">
        <Skeleton shape="line" className="h-5 w-40" />
        <div className="flex items-center gap-4 md:gap-8">
          <Skeleton shape="poster" className="w-24 shrink-0 md:w-40" />
          <div className="flex flex-1 flex-col gap-3">
            <Skeleton shape="line" className="w-1/3" />
            <Skeleton shape="line" className="h-8 w-2/3 md:h-10" />
            <Skeleton shape="line" className="w-1/2" />
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
              className="aspect-video h-auto w-full shrink-0 rounded-lg md:w-60"
            />
            <div className="flex flex-1 flex-col gap-3">
              <Skeleton shape="line" className="w-24" />
              <Skeleton shape="line" className="h-6 w-1/2" />
              <Skeleton shape="line" className="w-40" />
              <Skeleton shape="line" />
              <Skeleton shape="line" className="w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { SeasonSkeleton };
