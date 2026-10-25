import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { CatalogListCards } from "@/components/catalog/catalog-list-cards";
import { PaginationLinks } from "@/components/pagination-links";
import { POSTER_GRID_EAGER, PosterGrid } from "@/components/poster-grid";
import { RetryLink } from "@/components/retry-link";
import { PaginationSkeleton, PosterCardSkeleton } from "@/components/skeleton";
import { StatePanel } from "@/components/state-panel";
import { ButtonLink } from "@/components/ui/button";
import { GRID_PAGE_SIZE } from "@/lib/catalog/grid-page";
import { type CatalogList, listPageHref, listPath } from "@/lib/catalog/lists";
import { CATALOG_PATHS, CATALOG_SOURCES } from "@/lib/catalog/media-type";
import { parsePageParam } from "@/lib/catalog/pages";
import { isCatalogError } from "@/lib/catalog-errors";
import {
  lastListPage,
  listHasNextPage,
  readTaggedCatalogGridPage,
  type TaggedCatalogPage,
} from "@/lib/catalog-list-read";

const LANDING_LABELS = {
  tv: "Shows",
  movie: "Movies",
  game: "Games",
} as const satisfies Record<CatalogList["mediaType"], string>;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * One list's See all page, `/shows/{slug}`, `/movies/{slug}` or
 * `/games/{slug}` (spec 0021, AC-9, AC-10; spec 0028, AC-9 to AC-11): a back link to the landing, the list's h1 and note, then the
 * paged grid the landing used to be.
 *
 * The header is static and prerendered; the grid needs the `page` search
 * parameter, so it streams behind a skeleton of the same footprint. No
 * session is read here: each card's slots read it in their own Suspense
 * boundaries (`list-cards.tsx`).
 */
function CatalogListPage({
  list,
  searchParams,
}: {
  list: CatalogList;
  searchParams: SearchParams;
}) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col items-start gap-2">
        <Link
          href={CATALOG_PATHS[list.mediaType]}
          className="hit-area inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          {LANDING_LABELS[list.mediaType]}
        </Link>
        <h1 className="text-3xl leading-tight font-bold tracking-[-0.03em] text-foreground md:text-4xl">
          {list.heading}
        </h1>
        <p className="text-sm text-muted-foreground md:text-base">
          {list.note}
        </p>
      </header>

      <Suspense fallback={<ListGridSkeleton />}>
        <ListGrid list={list} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ListGrid({
  list,
  searchParams,
}: {
  list: CatalogList;
  searchParams: SearchParams;
}) {
  const page = parsePageParam((await searchParams).page);
  if (page === null) return <NoSuchPage list={list} />;

  const pageHref = (target: number) => listPageHref(list, target);

  let result: TaggedCatalogPage;
  try {
    result = await readTaggedCatalogGridPage(list, page);
  } catch (error) {
    if (!isCatalogError(error)) throw error;
    const source = CATALOG_SOURCES[list.mediaType];
    return (
      <div className="py-12">
        <StatePanel
          variant="error"
          title={`Couldn't reach ${source}`}
          description={`${source} didn't respond. Try again in a moment.`}
          action={<RetryLink href={pageHref(page)} />}
        />
      </div>
    );
  }

  if (page === 1 && result.paged.results.length === 0) {
    return (
      <div className="py-12">
        <StatePanel
          variant="empty"
          title="This list is empty"
          description={`${CATALOG_SOURCES[list.mediaType]} lists nothing here right now.`}
        />
      </div>
    );
  }

  // A games list with no count knows its end only by an empty page.
  const lastPage = lastListPage(result);
  if (result.paged.results.length === 0) return <NoSuchPage list={list} />;
  if (lastPage !== null && page > lastPage) return <NoSuchPage list={list} />;
  const hasNextPage = listHasNextPage(result, page);

  return (
    <div className="flex flex-col gap-10">
      <PosterGrid aria-label={`${list.heading}, page ${page}`}>
        <CatalogListCards
          result={result}
          returnPath={pageHref(page)}
          eagerCount={POSTER_GRID_EAGER.catalog}
        />
      </PosterGrid>

      <PaginationLinks
        page={page}
        lastPage={lastPage}
        hasNextPage={hasNextPage}
        href={pageHref}
      />
    </div>
  );
}

/** Shown for a malformed page number, and for one past the last page. */
function NoSuchPage({ list }: { list: CatalogList }) {
  return (
    <div className="py-12">
      <StatePanel
        variant="empty"
        title="That page doesn't exist"
        description={`There are no ${list.pageNoun} at this page number.`}
        action={
          <ButtonLink size="touch" href={listPath(list)}>
            Back to page 1
          </ButtonLink>
        }
      />
    </div>
  );
}

function ListGridSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <PosterGrid aria-hidden="true">
        {Array.from({ length: GRID_PAGE_SIZE }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
          <li key={index}>
            <PosterCardSkeleton />
          </li>
        ))}
      </PosterGrid>
      <PaginationSkeleton />
    </div>
  );
}

export { CatalogListPage };
