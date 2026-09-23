import { Skeleton } from "@/components/skeleton";

/**
 * The movie page while TMDB answers, at the footprint of what replaces it
 * (spec 0006, AC-11): the backdrop, the poster beside the title and meta
 * lines, the two section headings and one row of cast cards.
 *
 * It assumes a backdrop, which most movies have. A movie without one collapses
 * upwards when it arrives, which is a smaller jump than reserving no space for
 * the common case.
 */
function MovieDetailSkeleton() {
  return (
    <div className="flex flex-col gap-10 md:gap-14">
      <div className="flex flex-col">
        <Skeleton
          shape="line"
          className="-mx-4 -mt-8 aspect-video h-auto w-auto max-h-[70vh] rounded-none md:-mt-12"
        />
        <div className="relative z-10 -mt-10 flex items-end gap-4 sm:-mt-20 md:-mt-40 md:gap-8">
          <Skeleton shape="poster" className="w-28 shrink-0 sm:w-40 md:w-60" />
          <div className="flex flex-1 flex-col gap-3 pb-1">
            <Skeleton shape="line" className="h-8 w-3/4 md:h-12" />
            <Skeleton shape="line" className="w-1/2" />
            <div className="hidden gap-2 sm:flex">
              <Skeleton shape="pill" />
              <Skeleton shape="pill" />
              <Skeleton shape="pill" />
            </div>
            <Skeleton shape="pill" className="hidden w-40 sm:block" />
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:hidden">
          <div className="flex gap-2">
            <Skeleton shape="pill" />
            <Skeleton shape="pill" />
          </div>
          <Skeleton shape="pill" className="w-40" />
        </div>
      </div>

      <div className="flex max-w-[65ch] flex-col gap-3">
        <Skeleton shape="line" className="h-6 w-32" />
        <Skeleton shape="line" />
        <Skeleton shape="line" />
        <Skeleton shape="line" className="w-2/3" />
      </div>

      <div className="flex flex-col gap-4">
        <Skeleton shape="line" className="h-6 w-20" />
        <div className="flex gap-3 overflow-hidden md:gap-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
              key={index}
              className="flex w-[120px] shrink-0 flex-col gap-2 md:w-[140px]"
            >
              <Skeleton shape="poster" />
              <Skeleton shape="line" className="w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { MovieDetailSkeleton };
