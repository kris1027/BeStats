import {
  DetailHeroSkeleton,
  OverviewSkeleton,
} from "@/components/catalog/detail-skeletons";

/**
 * The game page while IGDB answers (spec 0025, AC-9; spec 0031, AC-12): the
 * hero skeleton with a backdrop, since most games have art, and no tagline,
 * which games never have, then the Overview. A game with no art moves up
 * when it streams in, the tradeoff movies accept. Two meta rows, for the
 * chips and the platforms line.
 */
function GameDetailSkeleton() {
  return (
    <div className="flex flex-col gap-10 md:gap-14">
      {/*
       * Every Skeleton is aria-hidden, so without this a screen reader hears
       * nothing while the game streams in.
       */}
      <p role="status" className="sr-only">
        Loading game details
      </p>
      <DetailHeroSkeleton tagline={false} metaRows={2} />
      <OverviewSkeleton />
    </div>
  );
}

export { GameDetailSkeleton };
