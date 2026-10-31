import { Suspense } from "react";

import { LANDING_COUNTS } from "@/lib/catalog/landing";
import type { CatalogList } from "@/lib/catalog/lists";
import {
  headingId,
  LandingPoster,
  readLandingSection,
  SECTION_LABEL_CLASS,
  SectionHeader,
  SeeAllLink,
} from "./landing-parts";
import { TRENDING_ITEM_CLASS, TrendingSkeleton } from "./landing-skeletons";

const TRENDING_SIZES = "(min-width: 768px) 260px, 160px";

/** Posters loaded eagerly: the ones a wide first screen shows (spec 0021, AC-7). */
const EAGER = 4;

/**
 * Trending this week (prompts/home-parallax-landing.md, decisions 9 and 14;
 * prompts/mobile-landing-parallax.md, decisions 2 and 6). With motion
 * allowed, the section is 320svh tall from `md` and 220svh on a phone, where
 * the shorter row needs less scroll, and its inner frame sticks to the
 * viewport while the page scrolls, so the row pans sideways and the bar
 * fills (`LandingParallax`). `svh`, so a phone's address bar sliding away
 * does not stretch the pin. With reduced motion the same markup is a native
 * swipe row: the frame scrolls on its own and nothing sticks. The "Keep
 * scrolling" hint stays off a phone, whose header row has no room for it.
 *
 * The cards are an ordered list in rank order, so the outlined numbers are
 * decoration and the order is still announced.
 */
function TrendingPin({ list }: { list: CatalogList }) {
  return (
    <section
      data-pin=""
      aria-labelledby={headingId(list)}
      className="relative py-12 motion-safe:h-[220svh] motion-safe:py-0 md:motion-safe:h-[320svh]"
    >
      <div className="flex flex-col gap-6 md:gap-8 motion-safe:sticky motion-safe:top-0 motion-safe:h-svh motion-safe:justify-center">
        <SectionHeader
          list={list}
          aside={
            <div className="flex items-baseline gap-5">
              <span
                aria-hidden="true"
                className={`${SECTION_LABEL_CLASS} hidden md:motion-safe:inline`}
              >
                Keep scrolling →
              </span>
              <SeeAllLink list={list} />
            </div>
          }
        />
        <div className="-mx-4 snap-x snap-mandatory scroll-px-4 overflow-x-auto overscroll-x-contain px-4 pt-2 pb-3 [scrollbar-width:none] motion-safe:snap-none motion-safe:overflow-x-clip [&::-webkit-scrollbar]:hidden">
          <Suspense fallback={<TrendingSkeleton />}>
            <TrendingItems list={list} />
          </Suspense>
        </div>
        <div
          aria-hidden="true"
          className="hidden h-0.5 overflow-hidden rounded-full bg-foreground/10 motion-safe:block"
        >
          {/*
           * Empty until the script fills it. A `transform`, not Tailwind's
           * `scale-x-0`, which sets the separate `scale` property and would
           * multiply the script's value back to zero.
           */}
          <div
            data-pin-bar=""
            suppressHydrationWarning
            style={{ transform: "scaleX(0)" }}
            className="h-full origin-left bg-foreground"
          />
        </div>
      </div>
    </section>
  );
}

/** The ranked cards, or the row's error or empty line (decision 16). */
async function TrendingItems({ list }: { list: CatalogList }) {
  const section = await readLandingSection(list, LANDING_COUNTS.trending);
  if (section.kind === "state") return section.state;
  const { items, ids } = section;

  return (
    <ol
      data-pin-track=""
      suppressHydrationWarning
      className="flex w-max gap-4 md:gap-7"
    >
      {items.map((item, index) => (
        <li key={item.id} className="flex shrink-0 snap-start items-end">
          <RankNumber rank={index + 1} />
          <div className={`relative z-10 ${TRENDING_ITEM_CLASS}`}>
            <LandingPoster
              item={item}
              ids={ids}
              sizes={TRENDING_SIZES}
              priority={index < EAGER}
              drift={false}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The outlined rank behind a card's left edge; the list carries the order. */
function RankNumber({ rank }: { rank: number }) {
  return (
    <span
      aria-hidden="true"
      className="rank-outline relative -mr-3 mb-9 text-[96px] leading-[0.8] font-extrabold tracking-[-0.06em] md:-mr-6 md:text-[180px]"
    >
      {rank}
    </span>
  );
}

export { TrendingItems, TrendingPin };
