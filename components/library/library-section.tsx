import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";

import { PaginationLinks } from "@/components/pagination-links";
import { PosterGrid } from "@/components/poster-grid";
import { RetryLink } from "@/components/retry-link";
import { PosterCardSkeleton } from "@/components/skeleton";
import { StatePanel } from "@/components/state-panel";
import { NextEpisodePill } from "@/components/tracking/next-episode-pill";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/user";
import { parsePageParam } from "@/lib/catalog/pages";
import {
  getLibraryTitles,
  getShowRatings,
  getWatchedPage,
  getWatchlistPage,
  LIBRARY_PAGE_SIZE,
  type LibraryPage,
  libraryLastPage,
  type WatchedRow,
  type WatchlistRow,
} from "@/lib/tracking/library-lists";
import { showIdsKey } from "@/lib/tracking/show-state";

import { BadgeLegend } from "./badge-legend";
import { LibraryGrid } from "./library-grid";
import { type LibraryItem, type LibraryList, libraryItemKey } from "./types";

/** Every piece of copy that differs between the two pages. */
const COPY = {
  watchlist: {
    grid: "Your watchlist",
    empty: {
      title: "Your watchlist is empty",
      description: "Plan a movie or a show to see it here.",
    },
    browse: [
      { label: "Browse movies", href: "/movies" },
      { label: "Browse shows", href: "/shows" },
    ],
    failed: "Couldn't load your watchlist",
  },
  watched: {
    grid: "Titles you watched",
    empty: {
      title: "Nothing watched yet",
      description:
        "Movies you mark watched and shows you complete show up here.",
    },
    browse: [
      { label: "Browse movies", href: "/movies" },
      { label: "Browse shows", href: "/shows" },
    ],
    failed: "Couldn't load your watched titles",
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
 * On `/watched` the found shows' rated episodes come last, for their
 * calculated rating badge (spec 0019, AC-5). `redirect()` stays outside any
 * `try`.
 *
 * A failure of any read replaces the grid with an error panel and a retry
 * link. It never renders the empty state, which would tell the user their
 * list is gone, nor show cards without their rating (AC-11; spec 0019,
 * AC-10).
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

  const result: LibraryPage<LibraryRow> =
    list === "watchlist"
      ? watchlistRows(await getWatchlistPage(user.id, page))
      : watchedRows(await getWatchedPage(user.id, page));
  if (result.kind === "failed") {
    return <ListFailed list={list} page={page} />;
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
            <div className="flex flex-wrap justify-center gap-2">
              {COPY[list].browse.map(({ label, href }) => (
                <ButtonLink key={href} size="touch" href={href}>
                  {label}
                </ButtonLink>
              ))}
            </div>
          }
        />
      </div>
    );
  }

  const movieIds = result.rows
    .filter((row) => row.kind === "movie")
    .map((row) => row.tmdbId);
  const showIds = result.rows
    .filter((row) => row.kind === "tv")
    .map((row) => row.tmdbId);
  const titles = await getLibraryTitles(movieIds, showIds);
  if (titles.kind === "failed") {
    return (
      <LoadFailed
        title="Couldn't reach TMDB"
        description="TMDB didn't respond, so the titles couldn't load. Try again in a moment."
        href={pageHref(list, page)}
      />
    );
  }

  // A watched show's badge comes from its episode ratings, read only for the
  // shows TMDB found: a missing title's card shows no rating. A failed read
  // shows the list panel rather than cards that look unrated (spec 0019,
  // AC-10). Sequential on purpose, since the ids depend on the titles.
  let showRatings = new Map<number, number | null>();
  if (list === "watched") {
    const ratedIds = showIds.filter((id) => titles.shows.has(id));
    if (ratedIds.length > 0) {
      const read = await getShowRatings(user.id, ratedIds);
      if (read.kind === "failed") return <ListFailed list={list} page={page} />;
      showRatings = read.ratings;
    }
  }

  const items: LibraryItem[] = result.rows.map((row) => {
    const found =
      row.kind === "tv"
        ? titleOf(titles.shows.get(row.tmdbId))
        : titleOf(titles.movies.get(row.tmdbId));
    return {
      kind: row.kind,
      tmdbId: row.tmdbId,
      status: row.status,
      title: found?.title ?? null,
      posterUrl: found?.posterUrl ?? null,
      tmdbRating: found?.tmdbRating ?? null,
      rating: row.rating,
      showRating:
        row.kind === "tv" ? (showRatings.get(row.tmdbId) ?? null) : null,
      watchedAt: row.watchedAt,
    };
  });

  // Each watchlist show card's Next episode pill streams on its own
  // (spec 0013, AC-15). One key for the page, so every pill shares one
  // watched ids read. A Completed show on `/watched` has no next episode to
  // show, so that page builds none.
  const watchedIdsKey = showIdsKey(showIds);
  const nextEpisodes: Record<string, ReactNode> = {};
  for (const item of items) {
    if (list !== "watchlist") break;
    if (item.kind !== "tv" || item.title === null) continue;
    nextEpisodes[libraryItemKey(item)] = (
      <Suspense fallback={null}>
        <NextEpisodePill showId={item.tmdbId} watchedIdsKey={watchedIdsKey} />
      </Suspense>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <LibraryGrid
        list={list}
        items={items}
        label={`${COPY[list].grid}, page ${page}`}
        page={page}
        returnPath={pageHref(list, page)}
        nextEpisodes={nextEpisodes}
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

/** One row of either list, in the shape the page joins with TMDB. */
type LibraryRow = WatchlistRow & {
  rating: number | null;
  watchedAt: string | null;
};

/** The watchlist read, in the shared row shape: no score, no watched time. */
function watchlistRows(
  page: LibraryPage<WatchlistRow>,
): LibraryPage<LibraryRow> {
  if (page.kind === "failed") return page;
  return {
    kind: "ok",
    total: page.total,
    rows: page.rows.map((row) => ({ ...row, rating: null, watchedAt: null })),
  };
}

/**
 * The watched read, in the shared row shape (spec 0019). A movie keeps its
 * score and its exact watched time, for Undo. A show is `completed`, the
 * view's own filter, with no score of its own and no time, because nothing on
 * this page removes or restores it (AC-6).
 */
function watchedRows(page: LibraryPage<WatchedRow>): LibraryPage<LibraryRow> {
  if (page.kind === "failed") return page;
  return {
    kind: "ok",
    total: page.total,
    rows: page.rows.map((row) =>
      row.kind === "movie"
        ? {
            kind: "movie",
            tmdbId: row.tmdbId,
            status: null,
            rating: row.rating,
            watchedAt: row.watchedAt,
          }
        : {
            kind: "tv",
            tmdbId: row.tmdbId,
            status: "completed",
            rating: null,
            watchedAt: null,
          },
    ),
  };
}

/** The fields a card shows, from a movie or a show summary. */
function titleOf(
  summary:
    | { title: string; posterUrl: string | null; tmdbRating: number | null }
    | { name: string; posterUrl: string | null; tmdbRating: number | null }
    | undefined,
) {
  if (!summary) return null;
  return {
    title: "title" in summary ? summary.title : summary.name,
    posterUrl: summary.posterUrl,
    tmdbRating: summary.tmdbRating,
  };
}

/** Shown for a malformed page number, before any read (AC-9). */
function NoSuchPage({ list }: { list: LibraryList }) {
  return (
    <div className="py-12">
      <StatePanel
        variant="empty"
        title="That page doesn't exist"
        description="There are no titles at this page number."
        action={
          <ButtonLink size="touch" href={pageHref(list, 1)}>
            Back to page 1
          </ButtonLink>
        }
      />
    </div>
  );
}

/** A failed read of the list itself, or of the ratings its cards show. */
function ListFailed({ list, page }: { list: LibraryList; page: number }) {
  return (
    <LoadFailed
      title={COPY[list].failed}
      description="Your list didn't load. Try again in a moment."
      href={pageHref(list, page)}
    />
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
