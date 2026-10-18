import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { LANDING_COUNTS } from "@/lib/catalog/landing";
import type { CatalogList } from "@/lib/catalog/lists";
import { ArtFallback } from "./art-fallback";
import { LandingBadge, LandingControls } from "./landing-badge";
import type { LandingItem } from "./landing-items";
import { headingId, readLandingSection, SectionHeader } from "./landing-parts";
import {
  TOP_CARD_CLASS,
  TOP_LIST_CLASS,
  TopRatedSkeleton,
  topColumnSpeeds,
  topOffsetClass,
} from "./landing-skeletons";

const POSTER_SIZES =
  "(min-width: 1024px) 260px, (min-width: 768px) 330px, 45vw";

/**
 * Top rated (prompts/top-rated-parallax-columns.md, superseding the list of
 * prompts/home-parallax-landing.md): eight tall posters in staggered columns
 * that drift at their own speeds from `md`, each with a large faint rank
 * behind it. An ordered list, so the rank is announced without reading the
 * decorative number.
 */
function TopRatedList({ list }: { list: CatalogList }) {
  return (
    <section
      aria-labelledby={headingId(list)}
      className="flex flex-col gap-10 py-12 md:gap-28 md:pt-[14vh] md:pb-[30vh]"
    >
      <SectionHeader list={list} />
      <Suspense fallback={<TopRatedSkeleton />}>
        <TopRatedItems list={list} />
      </Suspense>
    </section>
  );
}

/**
 * The ranked columns, streamed behind `TopRatedSkeleton`. One ordered list in
 * rank order laid out as a grid, so reading and tab order run 1 to 8 while
 * each card carries its column's offset and speed and measures from the grid
 * (`data-speed-root`). Exported so its states can be tested on their own.
 */
async function TopRatedItems({ list }: { list: CatalogList }) {
  const section = await readLandingSection(list, LANDING_COUNTS.top);
  if (section.kind === "state") return section.state;
  const { items, ids } = section;

  return (
    <ol data-speed-root="" className={TOP_LIST_CLASS}>
      {items.map((item, index) => {
        const speeds = topColumnSpeeds(index);
        return (
          <li key={item.id} className={topOffsetClass(index)}>
            <div
              data-speed={speeds.base}
              data-speed-lg={speeds.lg}
              suppressHydrationWarning
            >
              <TopRatedCard item={item} ids={ids} rank={index + 1} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * One card: the rank behind the poster's top left, the poster, then the
 * badge and title beside the bookmark. The whole card is the title's link,
 * through an overlay under the badge and controls, as on `PosterCard`. The
 * card is its rank's `data-speed-root`, so the number drifts against its own
 * poster rather than the grid.
 */
function TopRatedCard({
  item,
  ids,
  rank,
}: {
  item: LandingItem;
  ids: readonly number[];
  rank: number;
}) {
  return (
    <article data-speed-root="" className={`group ${TOP_CARD_CLASS}`}>
      <span
        data-speed="-0.1"
        suppressHydrationWarning
        aria-hidden="true"
        className="rank-ghost pointer-events-none absolute top-0 -left-1 text-[88px] leading-[0.8] font-extrabold tracking-[-0.06em] select-none md:-left-2 md:text-[130px] lg:text-[140px]"
      >
        {rank}
      </span>
      <div
        data-poster-drift=""
        suppressHydrationWarning
        className="poster-drift poster-lift relative aspect-2/3 overflow-hidden rounded-xl transition-transform duration-300 ease-out motion-safe:group-hover:-translate-y-1.5"
      >
        {item.posterUrl ? (
          <Image
            src={item.posterUrl}
            alt=""
            fill
            sizes={POSTER_SIZES}
            className="object-cover transition-[filter] duration-200 group-hover:brightness-110"
          />
        ) : (
          <ArtFallback iconClassName="size-8" />
        )}
        <span
          aria-hidden="true"
          className="rim glass-rim pointer-events-none absolute inset-0 rounded-xl"
        />
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col items-start gap-2">
          <div className="relative z-20">
            <LandingBadge item={item} ids={ids} />
          </div>
          <h3 className="text-base leading-tight font-semibold tracking-[-0.01em] text-pretty text-foreground md:text-[19px]">
            <Link href={item.href} className="rounded-sm hover:underline">
              <span className="absolute inset-0 z-10" aria-hidden="true" />
              {item.title}
            </Link>
          </h3>
        </div>
        <div className="relative z-20 flex shrink-0 items-center">
          <LandingControls item={item} ids={ids} />
        </div>
      </div>
    </article>
  );
}

export { TopRatedItems, TopRatedList };
