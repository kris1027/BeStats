import { Suspense } from "react";

import { LANDING_COUNTS } from "@/lib/catalog/landing";
import type { CatalogList } from "@/lib/catalog/lists";
import {
  headingId,
  LandingPoster,
  readLandingSection,
  SectionHeader,
} from "./landing-parts";
import {
  POPULAR_GRID_CLASS,
  POPULAR_OFFSETS,
  PopularSkeleton,
} from "./landing-skeletons";

const POPULAR_SIZES = "(min-width: 768px) 240px, 50vw";

/** Each card's drift speed, cycled with `POPULAR_OFFSETS`. */
const SPEEDS = [0.06, -0.08, 0.14, -0.04, 0.1] as const;

/**
 * Popular (prompts/home-parallax-landing.md, decision 3): fourteen posters in a
 * staggered grid, each drifting at its own speed from `md`. A phone gets a
 * plain two column grid with no offsets.
 */
function PopularGrid({ list }: { list: CatalogList }) {
  return (
    <section
      aria-labelledby={headingId(list)}
      className="flex flex-col gap-8 py-12 md:gap-16 md:pt-[18vh] md:pb-[22vh]"
    >
      <SectionHeader list={list} />
      <Suspense fallback={<PopularSkeleton />}>
        <PopularItems list={list} />
      </Suspense>
    </section>
  );
}

/**
 * The staggered grid, streamed behind `PopularSkeleton`. Each card cycles
 * through the offsets and speeds by its index, so the stagger needs no
 * per title data. Exported so its states can be tested on their own.
 */
async function PopularItems({ list }: { list: CatalogList }) {
  const section = await readLandingSection(list, LANDING_COUNTS.popular);
  if (section.kind === "state") return section.state;
  const { items, ids } = section;

  return (
    <ul className={POPULAR_GRID_CLASS}>
      {items.map((item, index) => (
        <li
          key={item.id}
          className={POPULAR_OFFSETS[index % POPULAR_OFFSETS.length]}
        >
          <div
            data-speed={SPEEDS[index % SPEEDS.length]}
            suppressHydrationWarning
          >
            <LandingPoster item={item} ids={ids} sizes={POPULAR_SIZES} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export { PopularGrid, PopularItems };
