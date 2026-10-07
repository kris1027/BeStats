import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { PaginationLinks } from "@/components/pagination-links";
import { formatAirDate, formatShortDate } from "@/lib/format";
import {
  getLibraryMovieTitles,
  getMovieLibraryTab,
  getWatchedMoviesPage,
  type LibraryTabQuery,
  libraryLastPage,
  type MovieTab,
  type MovieTabCard,
} from "@/lib/tracking/library-lists";
import { LIBRARY_COPY } from "@/lib/tracking/messages";

import { BadgeLegend } from "./badge-legend";
import { LibraryGrid } from "./library-grid";
import {
  EmptyPanel,
  ListFailed,
  pageHref,
  settleTab,
  TabNotes,
  TmdbFailed,
} from "./library-panels";
import type { LibraryList, LibraryMovieItem } from "./types";

/**
 * A planned movie tab, Watchlist or Upcoming (AC-13, AC-15 to AC-18), on the
 * movie grid with its removal and Undo.
 */
export async function movieLibraryTab(query: LibraryTabQuery<MovieTab>) {
  const { tab: list, page, today } = query;
  const tab = await getMovieLibraryTab(query);
  const settled = settleTab(tab, list, "movie", page);
  if (settled.kind !== "ok") return settled.panel;

  const items = settled.cards.map((card) => movieItem(card, today));
  return (
    <MovieGridSection
      list={list}
      page={page}
      lastPage={settled.lastPage}
      items={items}
      notes={<TabNotes tab={settled} type="movie" list={list} page={page} />}
    />
  );
}

/** A movie card's plain data, with an Upcoming date formatted here. */
function movieItem(card: MovieTabCard, today: string): LibraryMovieItem {
  const empty = { rating: null, watchedAt: null, release: null };
  if (card.page === "missing") {
    return {
      ...empty,
      tmdbId: card.movieId,
      title: null,
      posterUrl: null,
      tmdbRating: null,
    };
  }
  const base = {
    ...empty,
    tmdbId: card.movieId,
    title: card.title.name,
    posterUrl: card.title.posterUrl,
    tmdbRating: card.title.tmdbRating,
  };
  if (card.page === "watchlist" || card.releaseDate === null) return base;
  const fullDate = formatAirDate(card.releaseDate) ?? card.releaseDate;
  return {
    ...base,
    release: {
      fullDate,
      shortDate: formatShortDate(card.releaseDate, today) ?? fullDate,
    },
  };
}

/**
 * Watched movies (spec 0008, AC-2; spec 0020, AC-16): one ordered query with
 * an exact count, then the TMDB titles for the cards shown. No
 * classification, no ceiling, and no failure note: membership reads no TMDB
 * data (AC-17).
 */
export async function watchedMoviesTab({
  userId,
  page,
}: {
  userId: string;
  page: number;
}) {
  const result = await getWatchedMoviesPage(userId, page);
  if (result.kind === "failed") {
    return <ListFailed list="watched" type="movie" page={page} />;
  }
  const lastPage = libraryLastPage(result.total);
  if (page > lastPage) redirect(pageHref("watched", "movie", lastPage));

  const titles = await getLibraryMovieTitles(
    result.rows.map((row) => row.tmdbId),
  );
  if (titles.kind === "failed") {
    return <TmdbFailed href={pageHref("watched", "movie", page)} />;
  }

  const items = result.rows.map((row): LibraryMovieItem => {
    const movie = titles.movies.get(row.tmdbId);
    return {
      tmdbId: row.tmdbId,
      title: movie?.title ?? null,
      posterUrl: movie?.posterUrl ?? null,
      tmdbRating: movie?.tmdbRating ?? null,
      rating: row.rating,
      watchedAt: row.watchedAt,
      release: null,
    };
  });
  return (
    <MovieGridSection
      list="watched"
      page={page}
      lastPage={lastPage}
      items={items}
      notes={null}
    />
  );
}

/** The movie grid with its pages and key, or the tab's empty state. */
function MovieGridSection({
  list,
  page,
  lastPage,
  items,
  notes,
}: {
  list: LibraryList;
  page: number;
  lastPage: number;
  items: LibraryMovieItem[];
  notes: ReactNode;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-10">
        {notes}
        <EmptyPanel list={list} type="movie" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {notes}
      <LibraryGrid
        list={list}
        items={items}
        label={`${LIBRARY_COPY[list].movie.grid}, page ${page}`}
        page={page}
        returnPath={pageHref(list, "movie", page)}
      />

      {lastPage > 1 ? (
        <PaginationLinks
          page={page}
          lastPage={lastPage}
          href={(target) => pageHref(list, "movie", target)}
        />
      ) : null}

      <BadgeLegend list={list} type="movie" />
    </div>
  );
}
