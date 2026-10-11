import {
  CastRowSkeleton,
  DetailHeroSkeleton,
  OverviewSkeleton,
  SectionHeadingSkeleton,
} from "@/components/catalog/detail-skeletons";

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
        <SectionHeadingSkeleton className="w-20" />
        <CastRowSkeleton />
      </div>
    </div>
  );
}

export { MovieDetailSkeleton };
