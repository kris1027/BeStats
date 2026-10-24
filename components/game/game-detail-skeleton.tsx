import { DetailHeroSkeleton } from "@/components/catalog/detail-skeletons";

/**
 * The game page while IGDB answers (spec 0025, AC-9): the hero skeleton with
 * no backdrop and no tagline, the layout `GameHero` always renders, so nothing
 * jumps when the game streams in. Two meta rows, for the chips and the
 * platforms line.
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
      <DetailHeroSkeleton backdrop={false} tagline={false} metaRows={2} />
    </div>
  );
}

export { GameDetailSkeleton };
