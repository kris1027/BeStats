import type * as React from "react";

import { RetryLink } from "@/components/retry-link";
import { PosterCardSkeleton } from "@/components/skeleton";
import type { CatalogList } from "@/lib/catalog/lists";
import { CATALOG_PATHS } from "@/lib/catalog/media-type";

/** How many titles a row holds: the first 12 of TMDB's page 1 (AC-3). */
const ROW_SIZE = 12;

/** A row card's fixed width, mirrored by `ROW_POSTER_SIZES` (AC-5). */
const ROW_ITEM_CLASS = "w-[140px] shrink-0 snap-start md:w-[180px]";

/** The `sizes` of a row card's poster, matching `ROW_ITEM_CLASS` (AC-5). */
const ROW_POSTER_SIZES = "(min-width: 768px) 180px, 140px";

/** A row whose TMDB read failed: only this row, with Try again (AC-11). */
function CarouselRowError({ list }: { list: CatalogList }) {
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

/** A row whose list loaded with no titles (AC-12). */
function CarouselRowEmpty({ list }: { list: CatalogList }) {
  return (
    <RowMessage>
      <p className="text-sm text-muted-foreground">{list.emptyRowText}</p>
    </RowMessage>
  );
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

export {
  CarouselRowEmpty,
  CarouselRowError,
  CarouselRowSkeleton,
  ROW_ITEM_CLASS,
  ROW_POSTER_SIZES,
  ROW_SIZE,
};
