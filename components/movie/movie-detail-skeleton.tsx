import {
  CastRowSkeleton,
  DetailHeroSkeleton,
  OverviewSkeleton,
} from "@/components/catalog/detail-skeletons";
import { Skeleton } from "@/components/skeleton";

/**
 * The movie page while TMDB answers, at the footprint of what replaces it
 * (spec 0006, AC-11): the hero, the two section headings and one row of cast
 * cards. The pieces are shared with the show page (spec 0009).
 */
function MovieDetailSkeleton() {
  return (
    <div className="flex flex-col gap-10 md:gap-14">
      {/*
       * Every Skeleton is aria-hidden, so without this a screen reader hears
       * nothing while the movie streams in.
       */}
      <p role="status" className="sr-only">
        Loading movie details
      </p>
      <DetailHeroSkeleton />
      <OverviewSkeleton />
      <div className="flex flex-col gap-4">
        <Skeleton shape="line" className="h-6 w-20" />
        <CastRowSkeleton />
      </div>
    </div>
  );
}

export { MovieDetailSkeleton };
