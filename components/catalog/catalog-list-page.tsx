import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { CatalogListCards } from "@/components/catalog/catalog-list-cards";
import { PaginationLinks } from "@/components/pagination-links";
import { PosterGrid } from "@/components/poster-grid";
import { RetryLink } from "@/components/retry-link";
import { PaginationSkeleton, PosterCardSkeleton } from "@/components/skeleton";
import { StatePanel } from "@/components/state-panel";
import { ButtonLink } from "@/components/ui/button";
import { type CatalogList, listPageHref, listPath } from "@/lib/catalog/lists";
import { CATALOG_PATHS } from "@/lib/catalog/media-type";
import { lastReachablePage, parsePageParam } from "@/lib/catalog/pages";
import {
  readTaggedCatalogList,
  type TaggedCatalogPage,
} from "@/lib/catalog-list-read";
import { TmdbError } from "@/lib/tmdb";

/** TMDB's list page size, which the skeleton mirrors. */
const PAGE_SIZE = 20;

/**
 * Cards whose posters load eagerly: one full row at the widest grid (4
 * columns from `md`), so the first row is never lazy at any width (spec 0021,
 * AC-7, keeping spec 0006, AC-1).
 */
const EAGER_POSTERS = 4;

const LANDING_LABELS = { tv: "Shows", movie: "Movies" } as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * One list's See all page, `/shows/{slug}` or `/movies/{slug}` (spec 0021,
 * AC-9, AC-10): a back link to the landing, the list's h1 and note, then the
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
    result = await readTaggedCatalogList(list, page);
  } catch (error) {
    if (!(error instanceof TmdbError)) throw error;
    return (
      <div className="py-12">
        <StatePanel
          variant="error"
          title="Couldn't reach TMDB"
          description="TMDB didn't respond. Try again in a moment."
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
          description="TMDB lists nothing here right now."
        />
      </div>
    );
  }

  const lastPage = lastReachablePage(result.paged.totalPages);
  if (page > lastPage) return <NoSuchPage list={list} />;

  return (
    <div className="flex flex-col gap-10">
      <PosterGrid aria-label={`${list.heading}, page ${page}`}>
        <CatalogListCards
          result={result}
          returnPath={pageHref(page)}
          eagerCount={EAGER_POSTERS}
        />
      </PosterGrid>

      <PaginationLinks page={page} lastPage={lastPage} href={pageHref} />
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
        {Array.from({ length: PAGE_SIZE }, (_, index) => (
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
