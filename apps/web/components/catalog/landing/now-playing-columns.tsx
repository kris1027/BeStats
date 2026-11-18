import { Suspense } from "react";

import { Skeleton } from "@/components/skeleton";
import { LANDING_COUNTS, nowBlurb } from "@/lib/catalog/landing";
import type { CatalogList } from "@/lib/catalog/lists";
import { landingItems, readLandingList } from "./landing-items";
import {
  headingId,
  LandingPoster,
  readLandingSection,
  SECTION_HEADING_CLASS,
  SECTION_LABEL_CLASS,
  SeeAllLink,
} from "./landing-parts";
import { NOW_GRID_CLASS, NowSkeleton } from "./landing-skeletons";

const NOW_SIZES = "(min-width: 768px) 22vw, 50vw";

/**
 * Each column's drift from `md` (decision 1): the design's three columns
 * moving at different speeds. Every card carries its column's speed and
 * measures from the grid, so the cards stay in reading order in the markup
 * while each column still moves as one.
 */
const COLUMN_SPEEDS = [0.12, -0.12, 0.24] as const;

/**
 * The same drift on a phone's two columns, each the other way from its
 * neighbour (prompts/mobile-landing-parallax.md, decision 8). The loop reads
 * it below `md`, where `index % 3` would no longer be a column.
 */
const NARROW_COLUMN_SPEEDS = [0.12, -0.12] as const;

/**
 * Now playing, or Airing today on the TV landing (prompts/home-parallax-
 * landing.md, decisions 1 and 12): a sidebar that sticks while three columns
 * of posters drift past it. A phone gets the sidebar above two columns that
 * drift opposite ways.
 */
function NowPlayingColumns({
  list,
  label,
}: {
  list: CatalogList;
  label: string;
}) {
  return (
    <section
      aria-labelledby={headingId(list)}
      className="grid gap-8 py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:items-start md:gap-[5vw] md:pt-[20vh] md:pb-[32vh]"
    >
      <div className="flex flex-col items-start gap-4 md:sticky md:top-[30vh]">
        <p className={SECTION_LABEL_CLASS}>{label}</p>
        <h2 id={headingId(list)} className={SECTION_HEADING_CLASS}>
          {list.rowTitle}
        </h2>
        <Suspense fallback={<Skeleton shape="line" className="w-48" />}>
          <NowBlurb list={list} />
        </Suspense>
        <SeeAllLink list={list} className="mt-2" />
      </div>
      <Suspense fallback={<NowSkeleton />}>
        <NowItems list={list} />
      </Suspense>
    </section>
  );
}

/**
 * The count line under the heading. It asks the same cached page as the
 * cards, so it costs no request, and says nothing when the list failed or
 * is empty: the cards' own state says that.
 */
async function NowBlurb({ list }: { list: CatalogList }) {
  const page = await readLandingList(list);
  const count =
    page === null ? 0 : landingItems(page, 0, LANDING_COUNTS.now).length;
  const blurb = nowBlurb(list, count);
  return blurb === null ? null : (
    <p className="max-w-xs text-base leading-relaxed text-text-secondary">
      {blurb}
    </p>
  );
}

/**
 * The three drifting columns, streamed behind `NowSkeleton`. The cards stay
 * one list in reading order; each carries its column's speed and measures
 * from the grid (`data-speed-root`), so a column moves as one without the
 * markup being split into columns. Exported so its states can be tested on
 * their own.
 */
async function NowItems({ list }: { list: CatalogList }) {
  const section = await readLandingSection(list, LANDING_COUNTS.now);
  if (section.kind === "state") return section.state;
  const { items, ids } = section;

  return (
    <ul data-speed-root="" className={NOW_GRID_CLASS}>
      {items.map((item, index) => (
        <li
          key={item.id}
          data-speed={COLUMN_SPEEDS[index % COLUMN_SPEEDS.length]}
          data-speed-narrow={
            NARROW_COLUMN_SPEEDS[index % NARROW_COLUMN_SPEEDS.length]
          }
          suppressHydrationWarning
        >
          <LandingPoster item={item} ids={ids} sizes={NOW_SIZES} />
        </li>
      ))}
    </ul>
  );
}

export { NowBlurb, NowItems, NowPlayingColumns };
