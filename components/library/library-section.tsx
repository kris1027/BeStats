import { redirect } from "next/navigation";

import { PaginationLinks } from "@/components/pagination-links";
import { PosterGrid } from "@/components/poster-grid";
import { RetryLink } from "@/components/retry-link";
import { PosterCardSkeleton } from "@/components/skeleton";
import { StatePanel } from "@/components/state-panel";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/user";
import { parsePageParam } from "@/lib/catalog/pages";
import {
  getLibraryTitles,
  getWatchedPage,
  getWatchlistPage,
  LIBRARY_PAGE_SIZE,
  type LibraryPage,
  libraryLastPage,
  type WatchedRow,
} from "@/lib/tracking/movie-lists";

import { BadgeLegend } from "./badge-legend";
import { LibraryGrid } from "./library-grid";
import type { LibraryItem, LibraryList } from "./types";

/** Every piece of copy that differs between the two pages. */
const COPY = {
  watchlist: {
    grid: "Your watchlist",
    empty: {
      title: "Your watchlist is empty",
      description: "Plan a movie to see it here.",
    },
    failed: "Couldn't load your watchlist",
  },
  watched: {
    grid: "Movies you watched",
    empty: {
      title: "Nothing watched yet",
      description: "Movies you mark watched show up here.",
    },
    failed: "Couldn't load your watched movies",
  },
} as const;

/** One URL per page: page 1 is the bare path, as on `/movies`. */
function pageHref(list: LibraryList, page: number): string {
  return page === 1 ? `/${list}` : `/${list}?page=${page}`;
}

/**
 * Everything on a list page below its heading (spec 0008, AC-1 to AC-3, AC-9
 * to AC-11, AC-13). It streams behind the page's Suspense boundary, because it
 * reads the session, the search params and the user's rows.
 *
 * The order is deliberate. `requireUser()` first, so a request that got past
 * the proxy still receives no list data (AC-3). Then the page parameter, so a
 * malformed or out of range value never costs a query (AC-9). Then one
 * Postgres read for the page and its exact count, a redirect when the page is
 * past the end, and only then the TMDB titles for the rows actually shown.
 * `redirect()` stays outside any `try`.
 *
 * A failure of either read replaces the grid with an error panel and a retry
 * link. It never renders the empty state, which would tell the user their
 * list is gone (AC-11).
 */
async function LibrarySection({
  list,
  searchParams,
}: {
  list: LibraryList;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();

  const page = parsePageParam((await searchParams).page);
  if (page === null) return <NoSuchPage list={list} />;

  const result: LibraryPage<Partial<WatchedRow> & { movieId: number }> =
    list === "watchlist"
      ? await getWatchlistPage(user.id, page)
      : await getWatchedPage(user.id, page);
  if (result.kind === "failed") {
    return (
      <LoadFailed
        title={COPY[list].failed}
        description="Your list didn't load. Try again in a moment."
        href={pageHref(list, page)}
      />
    );
  }

  const lastPage = libraryLastPage(result.total);
  if (page > lastPage) redirect(pageHref(list, lastPage));

  if (result.total === 0) {
    return (
      <div className="py-12">
        <StatePanel
          variant="empty"
          title={COPY[list].empty.title}
          description={COPY[list].empty.description}
          action={
            <ButtonLink size="touch" href="/movies">
              Browse movies
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const titles = await getLibraryTitles(result.rows.map((row) => row.movieId));
  if (titles.kind === "failed") {
    return (
      <LoadFailed
        title="Couldn't reach TMDB"
        description="TMDB didn't respond, so the titles couldn't load. Try again in a moment."
        href={pageHref(list, page)}
      />
    );
  }

  const items: LibraryItem[] = result.rows.map((row) => {
    const movie = titles.titles.get(row.movieId);
    return {
      movieId: row.movieId,
      title: movie?.title ?? null,
      posterUrl: movie?.posterUrl ?? null,
      tmdbRating: movie?.tmdbRating ?? null,
      rating: row.rating ?? null,
      watchedAt: row.watchedAt ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-10">
      <LibraryGrid
        list={list}
        items={items}
        label={`${COPY[list].grid}, page ${page}`}
        page={page}
        returnPath={pageHref(list, page)}
      />

      {lastPage > 1 ? (
        <PaginationLinks
          page={page}
          lastPage={lastPage}
          href={(target) => pageHref(list, target)}
        />
      ) : null}

      <BadgeLegend list={list} />
    </div>
  );
}

/** Shown for a malformed page number, before any read (AC-9). */
function NoSuchPage({ list }: { list: LibraryList }) {
  return (
    <div className="py-12">
      <StatePanel
        variant="empty"
        title="That page doesn't exist"
        description="There are no movies at this page number."
        action={
          <ButtonLink size="touch" href={pageHref(list, 1)}>
            Back to page 1
          </ButtonLink>
        }
      />
    </div>
  );
}

function LoadFailed({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <div className="py-12">
      <StatePanel
        variant="error"
        title={title}
        description={description}
        action={<RetryLink href={href} />}
      />
    </div>
  );
}

/** The static shell's stand in for the list, at the same footprint (AC-12). */
function LibrarySkeleton() {
  return (
    <PosterGrid aria-hidden="true">
      {Array.from({ length: LIBRARY_PAGE_SIZE }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
        <li key={index}>
          <PosterCardSkeleton />
        </li>
      ))}
    </PosterGrid>
  );
}

export { LibrarySection, LibrarySkeleton };
