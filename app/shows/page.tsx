import type { Metadata } from "next";
import { Suspense } from "react";

import { PaginationLinks } from "@/components/pagination-links";
import { PosterCard } from "@/components/poster-card";
import { PosterGrid } from "@/components/poster-grid";
import { TmdbRatingBadge } from "@/components/rating-badges";
import { RetryLink } from "@/components/retry-link";
import { PosterCardSkeleton } from "@/components/skeleton";
import { StatePanel } from "@/components/state-panel";
import { ButtonLink } from "@/components/ui/button";
import { lastReachablePage, parsePageParam } from "@/lib/catalog/pages";
import { discoverTvShows, TmdbError } from "@/lib/tmdb";

export const metadata: Metadata = {
  title: "Shows",
};

/** TMDB's discover page size, which the skeleton mirrors. */
const PAGE_SIZE = 20;

/**
 * Cards whose posters load eagerly: one full row at the widest grid (6
 * columns at `xl`), so the first row is never lazy at any width (spec 0006, AC-1; spec 0009, AC-1).
 */
const EAGER_POSTERS = 6;

/** One URL per page: page 1 is the bare path. */
function pageHref(page: number): string {
  return page === 1 ? "/shows" : `/shows?page=${page}`;
}

/**
 * The TV landing: popular shows from TMDB, paged, the same page as `/movies`
 * (spec 0009, AC-1, AC-2).
 *
 * The heading is static and prerendered; the grid needs the `page` search
 * parameter, so it streams inside the Suspense boundary behind a grid of
 * skeleton cards at the same footprint (AC-17). No session is read here and no
 * card has a tracking control: the TV bookmark arrives with feature 14
 * (AC-18).
 */
export default function ShowsPage({ searchParams }: PageProps<"/shows">) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl leading-tight font-bold tracking-[-0.03em] text-foreground md:text-4xl">
          Popular shows
        </h1>
        <p className="text-sm text-muted-foreground md:text-base">
          Ordered by current popularity on TMDB.
        </p>
      </header>

      <Suspense fallback={<PopularShowsSkeleton />}>
        <PopularShows searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function PopularShows({
  searchParams,
}: {
  searchParams: PageProps<"/shows">["searchParams"];
}) {
  const page = parsePageParam((await searchParams).page);
  if (page === null) return <NoSuchPage />;

  let result: Awaited<ReturnType<typeof discoverTvShows>>;
  try {
    result = await discoverTvShows({ page });
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

  const lastPage = lastReachablePage(result.totalPages);
  if (page > lastPage) return <NoSuchPage />;

  return (
    <div className="flex flex-col gap-10">
      <PosterGrid aria-label={`Popular shows, page ${page}`}>
        {result.results.map((show, index) => (
          <li key={show.id}>
            <PosterCard
              title={show.name}
              posterUrl={show.posterUrl}
              href={`/shows/${show.id}`}
              badge={<TmdbRatingBadge value={show.tmdbRating} />}
              priority={index < EAGER_POSTERS}
            />
          </li>
        ))}
      </PosterGrid>

      <PaginationLinks page={page} lastPage={lastPage} href={pageHref} />
    </div>
  );
}

/** Shown for a malformed page number, and for one past the last page. */
function NoSuchPage() {
  return (
    <div className="py-12">
      <StatePanel
        variant="empty"
        title="That page doesn't exist"
        description="There are no popular shows at this page number."
        action={
          <ButtonLink size="touch" href="/shows">
            Back to page 1
          </ButtonLink>
        }
      />
    </div>
  );
}

function PopularShowsSkeleton() {
  return (
    <PosterGrid aria-hidden="true">
      {Array.from({ length: PAGE_SIZE }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
        <li key={index}>
          <PosterCardSkeleton />
        </li>
      ))}
    </PosterGrid>
  );
}
