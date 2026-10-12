import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import type * as React from "react";
import { Suspense } from "react";

import { CarouselScroller } from "@/components/catalog/carousel-scroller";
import { MovieListCard, ShowListCard } from "@/components/catalog/list-cards";
import { RetryLink } from "@/components/retry-link";
import { PosterCardSkeleton } from "@/components/skeleton";
import { type CatalogList, listPath } from "@/lib/catalog/lists";
import { CATALOG_PATHS } from "@/lib/catalog/media-type";
import {
  readTaggedCatalogList,
  type TaggedCatalogPage,
} from "@/lib/catalog-list-read";
import { TmdbError } from "@/lib/tmdb";

/** How many titles a row holds: the first 12 of TMDB's page 1 (AC-3). */
const ROW_SIZE = 12;

/** A row card's fixed width, mirrored by `ROW_POSTER_SIZES` (AC-5). */
const ROW_ITEM_CLASS = "w-[140px] shrink-0 snap-start md:w-[180px]";

/** The `sizes` of a row card's poster, matching `ROW_ITEM_CLASS` (AC-5). */
const ROW_POSTER_SIZES = "(min-width: 768px) 180px, 140px";

/**
 * One landing row: an h2 with See all and the arrow buttons, then up to 12
 * full cards that scroll sideways (spec 0021, AC-1, AC-5, AC-6).
 *
 * The header is part of the prerendered shell. The cards stream in their own
 * Suspense boundary behind 12 skeletons at the cards' width, so a row
 * arriving shifts nothing, and a slow or failing list never holds up the
 * others (AC-7, AC-11).
 *
 * @param eagerCount How many of the row's posters load eagerly: 6 on a
 * landing's first row, 0 on every other (AC-7).
 */
function CarouselRow({
  list,
  eagerCount,
}: {
  list: CatalogList;
  eagerCount: number;
}) {
  const headingId = `row-${list.slug}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <CarouselScroller
        label={list.rowTitle}
        heading={
          <h2
            id={headingId}
            className="text-xl font-semibold tracking-[-0.02em] text-foreground md:text-2xl"
          >
            {list.rowTitle}
          </h2>
        }
        seeAll={
          <Link
            href={listPath(list.mediaType, list.slug)}
            className="hit-area inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground"
          >
            See all
            <ChevronRightIcon className="size-4" aria-hidden="true" />
          </Link>
        }
      >
        <Suspense fallback={<CarouselRowSkeleton />}>
          <CarouselRowItems list={list} eagerCount={eagerCount} />
        </Suspense>
      </CarouselScroller>
    </section>
  );
}

/**
 * The row's cards, read at request time (`connection()` before the read), so
 * the build asks TMDB nothing and passes with no token (AC-7). Page 1 is the
 * same cached call page 1 of the list page makes (AC-3).
 *
 * A `TmdbError` stays inside this row as a compact error with Try again
 * (AC-11); anything else is a bug and is rethrown. A list that loaded empty
 * says so in one line (AC-12). Both reserve a card's height.
 */
async function CarouselRowItems({
  list,
  eagerCount,
}: {
  list: CatalogList;
  eagerCount: number;
}) {
  await connection();

  let result: TaggedCatalogPage;
  try {
    result = await readTaggedCatalogList(list, 1);
  } catch (error) {
    if (!(error instanceof TmdbError)) throw error;
    return (
      <RowMessage>
        <p className="text-sm font-semibold text-foreground">
          Couldn't load {list.rowTitle}
        </p>
        <p className="text-sm text-muted-foreground">TMDB didn't respond.</p>
        <RetryLink href={CATALOG_PATHS[list.mediaType]} className="mt-1" />
      </RowMessage>
    );
  }

  if (result.paged.results.length === 0) {
    return (
      <RowMessage>
        <p className="text-sm text-muted-foreground">{list.emptyRowText}</p>
      </RowMessage>
    );
  }

  const returnPath = CATALOG_PATHS[list.mediaType];

  return (
    <ul className="flex gap-3 md:gap-4">
      <RowCards
        result={result}
        returnPath={returnPath}
        eagerCount={eagerCount}
      />
    </ul>
  );
}

/** The first `ROW_SIZE` titles as full cards, typed by media type (AC-4). */
function RowCards({
  result,
  returnPath,
  eagerCount,
}: {
  result: TaggedCatalogPage;
  returnPath: string;
  eagerCount: number;
}) {
  if (result.mediaType === "tv") {
    const shows = result.paged.results.slice(0, ROW_SIZE);
    const ids = shows.map((show) => show.id);
    return shows.map((show, index) => (
      <li key={show.id} className={ROW_ITEM_CLASS}>
        <ShowListCard
          show={show}
          gridShowIds={ids}
          returnPath={returnPath}
          priority={index < eagerCount}
          sizes={ROW_POSTER_SIZES}
        />
      </li>
    ));
  }
  const movies = result.paged.results.slice(0, ROW_SIZE);
  const ids = movies.map((movie) => movie.id);
  return movies.map((movie, index) => (
    <li key={movie.id} className={ROW_ITEM_CLASS}>
      <MovieListCard
        movie={movie}
        gridMovieIds={ids}
        returnPath={returnPath}
        priority={index < eagerCount}
        sizes={ROW_POSTER_SIZES}
      />
    </li>
  ));
}

/**
 * A row's error or empty message, over an invisible card skeleton so it
 * keeps exactly a card's height and the page does not shift (AC-11, AC-12).
 * One card wide, so the row does not overflow and both arrows stay disabled.
 */
function RowMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid">
      <div aria-hidden="true" className="invisible col-start-1 row-start-1">
        <div className={ROW_ITEM_CLASS}>
          <PosterCardSkeleton />
        </div>
      </div>
      <div className="col-start-1 row-start-1 flex flex-col items-start justify-center gap-1">
        {children}
      </div>
    </div>
  );
}

/** Twelve card skeletons at the row's card width (AC-7). */
function CarouselRowSkeleton() {
  return (
    <ul aria-hidden="true" className="flex gap-3 md:gap-4">
      {Array.from({ length: ROW_SIZE }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
        <li key={index} className={ROW_ITEM_CLASS}>
          <PosterCardSkeleton />
        </li>
      ))}
    </ul>
  );
}

export { CarouselRow, CarouselRowSkeleton };
