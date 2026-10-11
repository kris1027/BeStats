import {
  CastRowSkeleton,
  DetailHeroSkeleton,
  OverviewSkeleton,
  SectionHeadingSkeleton,
} from "@/components/catalog/detail-skeletons";
import { PosterGrid } from "@/components/poster-grid";
import { PosterCardSkeleton } from "@/components/skeleton";

/**
 * The show page while TMDB answers (spec 0009, AC-17): the hero, the
 * Overview, one row of season cards and the cast row, each at the footprint
 * of what replaces it. The season row shows as many cards as the grid has
 * columns at each width, so it is always exactly one row.
 */
function ShowDetailSkeleton() {
  return (
    <div className="flex flex-col gap-10 md:gap-14">
      <p role="status" className="sr-only">
        Loading show details
      </p>
      <DetailHeroSkeleton metaRows={2} />
      <OverviewSkeleton />
      <div className="flex flex-col gap-4">
        <SectionHeadingSkeleton className="w-24" />
        <PosterGrid aria-hidden="true">
          {SEASON_CARD_VISIBILITY.map((visibility, index) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
              key={index}
              className={visibility}
            >
              <PosterCardSkeleton meta />
            </li>
          ))}
        </PosterGrid>
      </div>
      <CastSectionSkeleton />
    </div>
  );
}

/**
 * Cards past the column count at each width are hidden, so the placeholder
 * row never wraps: 2 below `md`, 4 from it.
 */
const SEASON_CARD_VISIBILITY = ["", "", "hidden md:block", "hidden md:block"];

/** The cast heading and row, also the fallback of the cast's own boundary. */
function CastSectionSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeadingSkeleton className="w-20" />
      <CastRowSkeleton />
    </div>
  );
}

export { ShowDetailSkeleton };
