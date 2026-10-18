import { FilmIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import {
  CarouselRowEmpty,
  CarouselRowError,
} from "@/components/catalog/carousel-row-states";
import { LANDING_COUNTS } from "@/lib/catalog/landing";
import type { CatalogList } from "@/lib/catalog/lists";
import { formatShortDate } from "@/lib/format";
import { requestTodayUtc } from "@/lib/tracking/episode-state";
import { LandingBadge, LandingControls } from "./landing-badge";
import {
  itemIds,
  type LandingItem,
  landingItems,
  readLandingList,
} from "./landing-items";
import { headingId, SectionHeader } from "./landing-parts";
import { UpcomingSkeleton, WIDE_CARD_CLASS } from "./landing-skeletons";

const CARD_SIZES = "(min-width: 768px) 340px, 260px";

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
 * landing.md, decisions 12 and 13): wide backdrop cards in two rows that
 * slide in opposite directions as the section crosses the viewport. The rows
 * hold different titles, 1 to 10 and 11 to 20, so nothing is announced twice.
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

async function UpcomingItems({ list }: { list: CatalogList }) {
  const page = await readLandingList(list);
  if (page === null) return <CarouselRowError list={list} />;
  const size = LANDING_COUNTS.upcomingRow;
  const rows = [
    landingItems(page, 0, size),
    landingItems(page, size, 2 * size),
  ];
  const filled = rows.filter((row) => row.length > 0);
  if (filled.length === 0) return <CarouselRowEmpty />;
  const ids = itemIds(filled.flat());
  const today = requestTodayUtc();

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      {filled.map((row, index) => (
        <div key={row[0].id} className={FRAME_CLASS}>
          <ul
            data-marquee={index === 0 ? "1" : "-1"}
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

/**
 * The card's date: a movie's release day in UTC, with the year only outside
 * this one, or a show's first air year, since a TV list result carries no
 * next air date (decision 12).
 */
function dateLabel(item: LandingItem, today: string): string | null {
  if (item.mediaType === "tv") {
    return item.year === null ? null : String(item.year);
  }
  return formatShortDate(item.releaseDate, today);
}

/**
 * A wide card: the backdrop, or the poster cropped to fill, or the flat
 * missing image plate (decision 10), with the title and date over a shade at
 * the bottom. The whole card is the title's link; the badge and, top left,
 * the controls sit above it (prompts/landing-card-controls.md). The control
 * row lets clicks through between its children, as `PosterCard`'s does, and
 * leaves out the release pill: the date at the bottom already says it
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
  const src = item.backdropUrl ?? item.posterUrl;
  return (
    <article
      className={`group relative overflow-hidden rounded-lg ${WIDE_CARD_CLASS}`}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          sizes={CARD_SIZES}
          className="object-cover transition-[filter] duration-200 group-hover:brightness-110"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-glass-plate">
          <FilmIcon
            className="size-8 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-t from-background/85 to-transparent to-60%"
      />
      <span
        aria-hidden="true"
        className="rim glass-rim pointer-events-none absolute inset-0 rounded-lg"
      />
      <div className="plate-solid absolute top-2.5 right-2.5 z-20 rounded-full backdrop-blur-glass">
        <LandingBadge item={item} ids={ids} />
      </div>
      <div className="plate-solid pointer-events-none absolute top-2.5 left-2.5 z-20 flex items-center gap-2 *:pointer-events-auto">
        <LandingControls item={item} ids={ids} releasePill={false} />
      </div>
      <div className="absolute inset-x-4 bottom-3.5 flex items-end justify-between gap-3">
        <h3 className="line-clamp-2 text-base leading-snug font-semibold text-foreground">
          <Link href={item.href} className="rounded-sm hover:underline">
            <span className="absolute inset-0 z-10" aria-hidden="true" />
            {item.title}
          </Link>
        </h3>
        {label ? (
          <span className="shrink-0 text-xs whitespace-nowrap text-text-secondary">
            {label}
          </span>
        ) : null}
      </div>
    </article>
  );
}

export { UpcomingItems, UpcomingRows };
