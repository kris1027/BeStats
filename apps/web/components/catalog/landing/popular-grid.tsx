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
  PopularSkeleton,
  popularDeckRow,
  popularDeckStyle,
  popularOffsetClass,
} from "./landing-skeletons";

const POPULAR_SIZES = "(min-width: 768px) 240px, 50vw";

/** Each card's drift speed, cycled with the offsets (`popularOffsetClass`). */
const SPEEDS = [0.06, -0.08, 0.14, -0.04, 0.1] as const;

/**
 * Popular (prompts/home-parallax-landing.md, decision 3): fourteen posters in a
 * staggered grid, each drifting at its own speed. A phone with motion
 * allowed gets a deck instead: pairs that stick and slide over each other
 * while the ones beneath shrink and dim (prompts/mobile-landing-parallax.md,
 * decision 13); with reduced motion, a still two column grid.
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
 * per title data. `data-deck` marks it for the phone's deck, each card
 * with its row and the shade `LandingParallax` fades in as it is covered.
 * Exported so its states can be tested on their own.
 */
async function PopularItems({ list }: { list: CatalogList }) {
  const section = await readLandingSection(list, LANDING_COUNTS.popular);
  if (section.kind === "state") return section.state;
  const { items, ids } = section;

  return (
    <ul data-deck="" className={POPULAR_GRID_CLASS}>
      {items.map((item, index) => (
        <li
          key={item.id}
          data-deck-card=""
          data-deck-row={popularDeckRow(index)}
          suppressHydrationWarning
          className={popularOffsetClass(index)}
          style={popularDeckStyle(index)}
        >
          <div
            data-speed={SPEEDS[index % SPEEDS.length]}
            data-speed-narrow="0"
            suppressHydrationWarning
          >
            <LandingPoster item={item} ids={ids} sizes={POPULAR_SIZES} />
          </div>
          <span
            data-deck-shade=""
            aria-hidden="true"
            suppressHydrationWarning
            className="pointer-events-none absolute inset-0 z-20 rounded-xl bg-background opacity-0 motion-reduce:hidden md:hidden"
          />
        </li>
      ))}
    </ul>
  );
}

export { PopularGrid, PopularItems };
