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
import {
  CATALOG_PATHS,
  type MediaType,
  parseMediaTypeParam,
  typedHref,
} from "@/lib/catalog/media-type";
import { parsePageParam } from "@/lib/catalog/pages";
import {
  getLibraryTitles,
  getWatchedPage,
  getWatchlistPage,
  LIBRARY_PAGE_SIZE,
  type LibraryPage,
  libraryLastPage,
  type WatchedRow,
  type WatchlistRow,
} from "@/lib/tracking/library-lists";
import { getShowRatings } from "@/lib/tracking/show-ratings";
import { showIdsKey } from "@/lib/tracking/show-state";
import type { TvStatus } from "@/lib/tracking/types";

import { BadgeLegend } from "./badge-legend";
import { LibraryGrid } from "./library-grid";
import {
  type LibraryItem,
  type LibraryList,
  libraryItemKey,
  SHOW_CARD,
} from "./types";

/**
 * Every piece of copy that differs between the two pages and their two tabs
 * (feature 22). Each empty state offers the one catalog its tab lists.
 */
const COPY = {
  watchlist: {
    tv: {
      grid: "Shows on your watchlist",
      empty: {
        title: "Your show watchlist is empty",
        description: "Plan a show to see it here.",
      },
      browse: { label: "Browse shows", href: CATALOG_PATHS.tv },
    },
    movie: {
      grid: "Movies on your watchlist",
      empty: {
        title: "Your movie watchlist is empty",
        description: "Plan a movie to see it here.",
      },
      browse: { label: "Browse movies", href: CATALOG_PATHS.movie },
    },
    failed: "Couldn't load your watchlist",
  },
  watched: {
    tv: {
      grid: "Shows you completed",
      empty: {
        title: "No completed shows yet",
        description: "Shows you complete show up here.",
      },
      browse: { label: "Browse shows", href: CATALOG_PATHS.tv },
    },
    movie: {
      grid: "Movies you watched",
      empty: {
        title: "No watched movies yet",
        description: "Movies you mark watched show up here.",
      },
      browse: { label: "Browse movies", href: CATALOG_PATHS.movie },
    },
    failed: "Couldn't load your watched titles",
  },
} as const;

/**
 * One URL per page and tab: `type` always, as every navbar link writes it,
 * and `page` from page 2, as on `/movies`.
 */
function pageHref(list: LibraryList, type: MediaType, page: number): string {
  return typedHref(`/${list}`, type, { page });
}

/**
 * Everything on a list page below its heading (spec 0008, AC-1 to AC-3, AC-9
 * to AC-11, AC-13). It streams behind the page's Suspense boundary, because it
 * reads the session, the search params and the user's rows. It lists one
 * media type, the navbar tab's `type` parameter (feature 22).
 *
 * The order is deliberate. `requireUser()` first, so a request that got past
 * the proxy still receives no list data (AC-3). Then the type and page
 * parameters, so a malformed or out of range value never costs a query
 * (AC-9). Then one
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

  const raw = await searchParams;
  const type = parseMediaTypeParam(raw.type);
  const page = parsePageParam(raw.page);
  if (type === null) return <NoSuchPage list={list} type={null} />;
  if (page === null) return <NoSuchPage list={list} type={type} />;

  const result: LibraryPage<LibraryRow> =
    list === "watchlist"
      ? watchlistRows(await getWatchlistPage(user.id, type, page))
      : watchedRows(await getWatchedPage(user.id, type, page));
  if (result.kind === "failed") {
    return <ListFailed list={list} type={type} page={page} />;
  }

  const lastPage = libraryLastPage(result.total);
  if (page > lastPage) redirect(pageHref(list, type, lastPage));

  if (result.total === 0) {
    return (
      <div className="py-12">
        <StatePanel
          variant="empty"
          title={COPY[list][type].empty.title}
          description={COPY[list][type].empty.description}
          action={
            <ButtonLink size="touch" href={COPY[list][type].browse.href}>
              {COPY[list][type].browse.label}
            </ButtonLink>
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
        href={pageHref(list, type, page)}
      />
    );
  }

  // A watched show's badge comes from its episode ratings, read only for the
  // shows TMDB found: a missing title's card shows no rating. A failed read
  // shows the list panel rather than cards that look unrated (spec 0019,
  // AC-10). Sequential on purpose, since the ids depend on the titles.
  let showRatings = new Map<number, number | null>();
  const ratedIds = SHOW_CARD[list].calculatedRating
    ? showIds.filter((id) => titles.shows.has(id))
    : [];
  if (ratedIds.length > 0) {
    const read = await getShowRatings(user.id, ratedIds);
    if (read.kind === "failed") {
      return <ListFailed list={list} type={type} page={page} />;
    }
    showRatings = read.ratings;
  }

  const items = result.rows.map((row): LibraryItem => {
    if (row.kind === "movie") {
      return { ...row, ...titleOf(titles.movies.get(row.tmdbId)) };
    }
    return {
      ...row,
      ...titleOf(titles.shows.get(row.tmdbId)),
      showRating: showRatings.get(row.tmdbId) ?? null,
    };
  });

  // Each watchlist show card's Next episode pill streams on its own
  // (spec 0013, AC-15). One key for the page, so every pill shares one
  // watched ids read. A Completed show on `/watched` has no next episode to
  // show, so that page builds none.
  const nextEpisodes: Record<string, ReactNode> = {};
  if (SHOW_CARD[list].nextEpisode) {
    const watchedIdsKey = showIdsKey(showIds);
    for (const item of items) {
      if (item.kind !== "tv" || item.title === null) continue;
      nextEpisodes[libraryItemKey(item)] = (
        <Suspense fallback={null}>
          <NextEpisodePill showId={item.tmdbId} watchedIdsKey={watchedIdsKey} />
        </Suspense>
      );
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <LibraryGrid
        list={list}
        items={items}
        label={`${COPY[list][type].grid}, page ${page}`}
        page={page}
        returnPath={pageHref(list, type, page)}
        nextEpisodes={nextEpisodes}
      />

      {lastPage > 1 ? (
        <PaginationLinks
          page={page}
          lastPage={lastPage}
          href={(target) => pageHref(list, type, target)}
        />
      ) : null}

      <BadgeLegend list={list} type={type} />
    </div>
  );
}

/**
 * One row of either list, in the shape the page joins with TMDB: a movie with
 * its score and watched time (both null on the watchlist), or a show with its
 * status.
 */
type LibraryRow =
  | {
      kind: "movie";
      tmdbId: number;
      rating: number | null;
      watchedAt: string | null;
    }
  | { kind: "tv"; tmdbId: number; status: TvStatus };

/** The watchlist read, in the shared row shape: no score, no watched time. */
function watchlistRows(
  page: LibraryPage<WatchlistRow>,
): LibraryPage<LibraryRow> {
  if (page.kind === "failed") return page;
  return {
    kind: "ok",
    total: page.total,
    rows: page.rows.map((row) =>
      row.kind === "movie"
        ? { kind: "movie", tmdbId: row.tmdbId, rating: null, watchedAt: null }
        : row,
    ),
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
            rating: row.rating,
            watchedAt: row.watchedAt,
          }
        : { kind: "tv", tmdbId: row.tmdbId, status: "completed" },
    ),
  };
}

/** The fields a card shows, from a movie or a show summary, or none. */
function titleOf(
  summary:
    | { title: string; posterUrl: string | null; tmdbRating: number | null }
    | { name: string; posterUrl: string | null; tmdbRating: number | null }
    | undefined,
) {
  if (!summary) return { title: null, posterUrl: null, tmdbRating: null };
  return {
    title: "title" in summary ? summary.title : summary.name,
    posterUrl: summary.posterUrl,
    tmdbRating: summary.tmdbRating,
  };
}

/** The page names a bad `type` panel sends the user back to. */
const LIST_NAMES = { watchlist: "Watchlist", watched: "Watched" } as const;

/**
 * Shown for a malformed page number or media type, before any read (AC-9;
 * feature 22). Never a silent redirect: the link was wrong, and the panel
 * says which part, a bad type worded like `/upcoming`'s. A bad page keeps
 * its tab; a bad type leads to the default one.
 *
 * @param type The parsed type, or null when the type itself is the problem.
 */
function NoSuchPage({
  list,
  type,
}: {
  list: LibraryList;
  type: MediaType | null;
}) {
  return (
    <div className="py-12">
      <StatePanel
        variant="empty"
        title="That page doesn't exist"
        description={
          type === null
            ? `There is no ${LIST_NAMES[list]} list at this address.`
            : "There are no titles at this page number."
        }
        action={
          <ButtonLink size="touch" href={pageHref(list, type ?? "tv", 1)}>
            {type === null ? `Back to ${LIST_NAMES[list]}` : "Back to page 1"}
          </ButtonLink>
        }
      />
    </div>
  );
}

/** A failed read of the list itself, or of the ratings its cards show. */
function ListFailed({
  list,
  type,
  page,
}: {
  list: LibraryList;
  type: MediaType;
  page: number;
}) {
  return (
    <LoadFailed
      title={COPY[list].failed}
      description="Your list didn't load. Try again in a moment."
      href={pageHref(list, type, page)}
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
