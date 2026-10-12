import type * as React from "react";
import { cache, Suspense } from "react";

import {
  CarouselRowSkeleton,
  ROW_ITEM_CLASS,
  ROW_POSTER_SIZES,
  ROW_SIZE,
} from "@/components/catalog/carousel-row-states";
import { CarouselScroller } from "@/components/catalog/carousel-scroller";
import { CatalogListCards } from "@/components/catalog/catalog-list-cards";
import { type MediaType, titleHref } from "@/lib/catalog/media-type";
import { getVisitorRegion } from "@/lib/region";
import {
  getMovieExtras,
  getTvExtras,
  type MovieExtras,
  TmdbError,
  type TvExtras,
} from "@/lib/tmdb";

import { AgeRatingChip } from "./title-details";
import { SECTION_HEADING_CLASS, SectionErrorLine } from "./title-section";
import { TrailerButton } from "./trailer-button";
import {
  WhereToWatch,
  WhereToWatchError,
  WhereToWatchSkeleton,
} from "./where-to-watch";

/**
 * The title page sections fed by the extras read (spec 0022, AC-11 to
 * AC-14, AC-18), shared by the movie and show pages.
 *
 * Each slot is its own async Server Component inside its own Suspense
 * boundary and calls `readExtras` itself. The calls share one read: the
 * cached `getMovieExtras` or `getTvExtras` underneath, and React `cache()`
 * on top, so one render asks once. The visitor's region is read only in the
 * slots that need it, outside the cache and inside their boundaries, so the
 * title pages keep their prerendered shells (AC-9, AC-10).
 */

/** Which extras read a slot makes, and the page a Retry reloads. */
type TitleRef = { mediaType: MediaType; id: number };

/** A `TitleRef` with the title's name, which the trailer dialog is labelled by. */
type NamedTitleRef = TitleRef & { title: string };

/**
 * The title's extras, or null when TMDB failed, a 404 included (AC-18). A
 * `TmdbError` stays inside the slot that asked; anything else is a bug and
 * is rethrown.
 */
const readExtras = cache(
  async (
    mediaType: TitleRef["mediaType"],
    id: number,
  ): Promise<MovieExtras | TvExtras | null> => {
    try {
      return mediaType === "movie"
        ? await getMovieExtras(id)
        : await getTvExtras(id);
    } catch (error) {
      if (!(error instanceof TmdbError)) throw error;
      return null;
    }
  },
);

/**
 * The hero's Trailer button (AC-11), or nothing: while the extras load,
 * when they failed, and when the title has no usable trailer.
 */
function TrailerSlot(props: NamedTitleRef) {
  return (
    <Suspense fallback={null}>
      <TrailerSlotContent {...props} />
    </Suspense>
  );
}

/**
 * The trailer slot's body. Exported apart from its Suspense boundary so the
 * tests can await it as the async Server Component it is; pages render
 * `TrailerSlot`.
 */
async function TrailerSlotContent({ mediaType, id, title }: NamedTitleRef) {
  const trailer = (await readExtras(mediaType, id))?.trailer ?? null;
  if (trailer === null) return null;
  return (
    <TrailerButton
      videoKey={trailer.key}
      videoName={trailer.name}
      title={title}
    />
  );
}

/**
 * The hero's age rating chip for the visitor's country (AC-13), or nothing:
 * while loading, on failure, and when that country has no rating.
 */
function AgeRatingSlot(props: TitleRef) {
  return (
    <Suspense fallback={null}>
      <AgeRatingSlotContent {...props} />
    </Suspense>
  );
}

/**
 * The age rating slot's body. Exported apart from its Suspense boundary for
 * the tests, like `TrailerSlotContent`; pages render `AgeRatingSlot`. It
 * reads the region here, never above the boundary (AC-9).
 */
async function AgeRatingSlotContent({ mediaType, id }: TitleRef) {
  const [extras, region] = await Promise.all([
    readExtras(mediaType, id),
    getVisitorRegion(),
  ]);
  const rating = extras?.ageRatings[region.code];
  if (rating === undefined) return null;
  return <AgeRatingChip rating={rating} region={region} />;
}

/** Where to watch in the visitor's country, with its own states (AC-12, AC-18). */
function WhereToWatchSection(props: TitleRef) {
  return (
    <Suspense fallback={<WhereToWatchSkeleton />}>
      <WhereToWatchContent {...props} />
    </Suspense>
  );
}

/**
 * Where to watch's body. Exported apart from its Suspense boundary for the
 * tests, like `TrailerSlotContent`; pages render `WhereToWatchSection`. It
 * reads the region here, never above the boundary (AC-9).
 */
async function WhereToWatchContent(props: TitleRef) {
  const [extras, region] = await Promise.all([
    readExtras(props.mediaType, props.id),
    getVisitorRegion(),
  ]);
  if (extras === null) {
    return (
      <WhereToWatchError
        region={region}
        href={titleHref(props.mediaType, props.id)}
      />
    );
  }
  return (
    <WhereToWatch
      region={region}
      providers={extras.watchProviders[region.code]}
    />
  );
}

/**
 * More like this (AC-14): up to 12 of TMDB's recommendations in the home
 * row card, through the same `CatalogListCards` as a landing row, so each
 * card carries the visitor's tracked, planned or watched status. No See all,
 * since TMDB's recommendations have no list page here. With none, the whole
 * section is left out; on failure it keeps its heading with a one line
 * error and Retry.
 */
function MoreLikeThisSection(props: TitleRef) {
  return (
    <Suspense
      fallback={
        <MoreLikeThisFrame>
          <CarouselRowSkeleton />
        </MoreLikeThisFrame>
      }
    >
      <MoreLikeThisContent {...props} />
    </Suspense>
  );
}

/**
 * More like this's body. Exported apart from its Suspense boundary for the
 * tests, like `TrailerSlotContent`; pages render `MoreLikeThisSection`.
 */
async function MoreLikeThisContent(props: TitleRef) {
  const extras = await readExtras(props.mediaType, props.id);
  if (extras === null) {
    return (
      <MoreLikeThisFrame>
        <SectionErrorLine
          what="recommendations"
          href={titleHref(props.mediaType, props.id)}
        />
      </MoreLikeThisFrame>
    );
  }
  if (extras.recommendations.paged.results.length === 0) return null;

  return (
    <MoreLikeThisFrame>
      <ul className="flex gap-3 md:gap-4">
        <CatalogListCards
          result={extras.recommendations}
          returnPath={titleHref(props.mediaType, props.id)}
          eagerCount={0}
          limit={ROW_SIZE}
          sizes={ROW_POSTER_SIZES}
          itemClassName={ROW_ITEM_CLASS}
        />
      </ul>
    </MoreLikeThisFrame>
  );
}

/** The section, its heading and the row's arrow scroller, in every state. */
function MoreLikeThisFrame({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-labelledby="more-like-this-heading"
      className="flex flex-col gap-4"
    >
      <CarouselScroller
        label="More like this"
        heading={
          <h2 id="more-like-this-heading" className={SECTION_HEADING_CLASS}>
            More like this
          </h2>
        }
        seeAll={null}
      >
        {children}
      </CarouselScroller>
    </section>
  );
}

export {
  AgeRatingSlot,
  AgeRatingSlotContent,
  MoreLikeThisContent,
  MoreLikeThisSection,
  TrailerSlot,
  TrailerSlotContent,
  WhereToWatchContent,
  WhereToWatchSection,
};
