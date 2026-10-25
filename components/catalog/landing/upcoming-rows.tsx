import { Suspense } from "react";

import { LANDING_COUNTS } from "@/lib/catalog/landing";
import type { CatalogList } from "@/lib/catalog/lists";
import { formatShortDate } from "@/lib/format";
import { requestTodayUtc } from "@/lib/tracking/episode-state";
import { LandingBadge, LandingControls } from "./landing-badge";
import {
  itemIds,
  type LandingItem,
  newLandingItems,
  readLandingList,
} from "./landing-items";
import { headingId, readLandingSection, SectionHeader } from "./landing-parts";
import { UpcomingSkeleton } from "./landing-skeletons";
import { WideCardView } from "./wide-card";

/**
 * A row's frame: out to the column's edges, scrolling natively on a phone
 * and with reduced motion, and clipped from `md` where `LandingParallax`
 * slides it (decisions 6 and 13). `overflow-x: clip` rather than hidden, so
 * focusing a card cannot scroll the frame behind the script's back.
 */
const FRAME_CLASS =
  "-mx-4 snap-x snap-mandatory scroll-px-4 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] md:motion-safe:snap-none md:motion-safe:overflow-x-clip min-[1600px]:mask-x-from-96% [&::-webkit-scrollbar]:hidden";

/**
 * Upcoming, or On the air on the TV landing (prompts/home-parallax-
 * landing.md, decisions 12 and 13): wide backdrop cards in up to four rows,
 * each sliding the other way from the one above as the section crosses the
 * viewport. The rows hold different titles, ten each, so nothing is
 * announced twice.
 */
function UpcomingRows({ list }: { list: CatalogList }) {
  return (
    <section
      aria-labelledby={headingId(list)}
      className="flex flex-col gap-8 py-12 md:gap-10 md:py-[14vh]"
    >
      <SectionHeader list={list} />
      <Suspense fallback={<UpcomingSkeleton />}>
        <UpcomingItems list={list} />
      </Suspense>
    </section>
  );
}

/**
 * The rows, streamed behind `UpcomingSkeleton`. Page 1 fills rows 1 and 2
 * and page 2 rows 3 and 4, each page only its own rows, so a short page 1
 * leaves row 2 short rather than pulling page 2 titles up (decision 13,
 * amended 2026-10-18). Page 1 alone decides the section's error and empty
 * states; a failed page 2 only leaves the extra rows out. The two reads run
 * together: when page 1 fails the page 2 read is wasted, but that is rare and
 * cached, while reading them in turn would delay every render. One `ids`
 * covers every row, so every card's badge and controls share a single
 * session read. Exported so its states can be tested without the section's
 * frame.
 */
async function UpcomingItems({ list }: { list: CatalogList }) {
  const size = LANDING_COUNTS.upcomingRow;
  const perPage = size * LANDING_COUNTS.upcomingRowsPerPage;
  const [section, pageTwo] = await Promise.all([
    readLandingSection(list, perPage),
    readLandingList(list, 2),
  ]);
  if (section.kind === "state") return section.state;
  const extra =
    pageTwo === null ? [] : newLandingItems(pageTwo, section.ids, perPage);
  const ids = [...section.ids, ...itemIds(extra)];
  const filled = [...toRows(section.items, size), ...toRows(extra, size)];
  const today = requestTodayUtc();

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      {filled.map((row, index) => (
        <div key={row[0].id} className={FRAME_CLASS}>
          <ul
            data-marquee={index % 2 === 0 ? "1" : "-1"}
            suppressHydrationWarning
            className="flex w-max gap-4 md:gap-5"
          >
            {row.map((item) => (
              <li key={item.id} className="shrink-0 snap-start">
                <WideCard
                  item={item}
                  ids={ids}
                  label={dateLabel(item, today)}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** `items` cut into rows of `size`, with no empty row. */
function toRows(items: readonly LandingItem[], size: number): LandingItem[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, row) =>
    items.slice(row * size, (row + 1) * size),
  );
}

/**
 * The card's date: a movie's or game's release day in UTC, with the year only
 * outside this one, or a show's first air year, since a TV list result
 * carries no next air date (decision 12; spec 0028, AC-8).
 */
function dateLabel(item: LandingItem, today: string): string | null {
  if (item.mediaType === "tv") {
    return item.year === null ? null : String(item.year);
  }
  return formatShortDate(item.releaseDate, today);
}

/**
 * A wide card with the section's badge and controls, the personal slots of
 * `landing-badge.tsx` in `WideCardView`'s two corners. The release pill is
 * left out: the date at the bottom already says it
 * (prompts/landing-review-fixes.md, decision 3).
 */
function WideCard({
  item,
  ids,
  label,
}: {
  item: LandingItem;
  ids: readonly number[];
  label: string | null;
}) {
  return (
    <WideCardView
      item={item}
      label={label}
      badge={<LandingBadge item={item} ids={ids} />}
      controls={<LandingControls item={item} ids={ids} releasePill={false} />}
    />
  );
}

export { UpcomingItems, UpcomingRows };
