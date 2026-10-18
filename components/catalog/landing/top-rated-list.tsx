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
  TOP_LIST_CLASS,
  TOP_POSTER_CLASS,
  TopRatedSkeleton,
} from "./landing-skeletons";

const POSTER_SIZES = "(min-width: 768px) 140px, 100px";

/**
 * Top rated (prompts/home-parallax-landing.md): a numbered list of eight,
 * each a poster beside its rating and title, with a large faint rank that
 * drifts behind it from `md`. An ordered list, so the rank is announced
 * without reading the decorative number.
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
 * The ranked list, streamed behind `TopRatedSkeleton`. An ordered list, so
 * the rank is announced from the markup and the large numbers can stay
 * decorative. Exported so its states can be tested on their own.
 */
async function TopRatedItems({ list }: { list: CatalogList }) {
  const section = await readLandingSection(list, LANDING_COUNTS.top);
  if (section.kind === "state") return section.state;
  const { items, ids } = section;

  return (
    <ol className={TOP_LIST_CLASS}>
      {items.map((item, index) => (
        <li key={item.id}>
          <TopRatedRow item={item} ids={ids} rank={index + 1} />
        </li>
      ))}
    </ol>
  );
}

/**
 * One entry: the whole row is the title's link, through an overlay under
 * the badge and controls, as on `PosterCard`. Missing artwork gets the same
 * flat tile.
 */
function TopRatedRow({
  item,
  ids,
  rank,
}: {
  item: LandingItem;
  ids: readonly number[];
  rank: number;
}) {
  return (
    <article className="group relative flex items-center gap-5 md:gap-7">
      <span
        data-speed="0.18"
        suppressHydrationWarning
        aria-hidden="true"
        className="pointer-events-none absolute -top-10 right-0 text-[96px] leading-none font-extrabold tracking-[-0.06em] text-foreground/6 md:-top-16 md:text-[150px]"
      >
        {rank}
      </span>
      <div
        data-poster-drift=""
        suppressHydrationWarning
        className={`poster-drift relative aspect-2/3 overflow-hidden rounded-lg ${TOP_POSTER_CLASS}`}
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
          <ArtFallback iconClassName="size-6" />
        )}
        <span
          aria-hidden="true"
          className="rim glass-rim pointer-events-none absolute inset-0 rounded-lg"
        />
      </div>
      <div className="flex min-w-0 flex-col items-start gap-2">
        <div className="relative z-20 flex flex-wrap items-center gap-2">
          <LandingBadge item={item} ids={ids} />
          <LandingControls item={item} ids={ids} />
        </div>
        <h3 className="text-lg leading-tight font-semibold tracking-[-0.01em] text-pretty text-foreground md:text-[22px]">
          <Link href={item.href} className="rounded-sm hover:underline">
            <span className="absolute inset-0 z-10" aria-hidden="true" />
            {item.title}
          </Link>
        </h3>
      </div>
    </article>
  );
}

export { TopRatedItems, TopRatedList };
