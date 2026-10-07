import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";

import { PaginationLinks } from "@/components/pagination-links";
import { PosterGrid } from "@/components/poster-grid";
import { RetryLink } from "@/components/retry-link";
import { PosterCardSkeleton } from "@/components/skeleton";
import { StatePanel } from "@/components/state-panel";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/user";
import {
  CATALOG_PATHS,
  type MediaType,
  parseMediaTypeParam,
  typedHref,
} from "@/lib/catalog/media-type";
import { parsePageParam } from "@/lib/catalog/pages";
import { formatAirDate, formatShortDate } from "@/lib/format";
import { requestTodayUtc } from "@/lib/tracking/episode-state";
import {
  getLibraryMovieTitles,
  getMovieLibraryTab,
  getShowLibraryTab,
  getWatchedMoviesPage,
  LIBRARY_CLASSIFY_LIMIT,
  LIBRARY_PAGE_SIZE,
  type LibraryTab,
  libraryLastPage,
  type MovieTab,
  type MovieTabCard,
  type ShowTabCard,
} from "@/lib/tracking/library-lists";
import { LIBRARY_COPY, LIBRARY_NOTES } from "@/lib/tracking/messages";
import { getShowRatings } from "@/lib/tracking/show-ratings";

import { BadgeLegend } from "./badge-legend";
import { MissingShowCard } from "./held-show-card";
import { HeldShowsSection } from "./held-shows";
import { LIBRARY_HEADING_ID } from "./ids";
import { LibraryGrid } from "./library-grid";
import { UpcomingShowCard, WatchedShowCard } from "./show-cards";
import type { LibraryList, LibraryMovieItem } from "./types";
import { WatchlistShowCard } from "./watchlist-show-card";

/** Posters that load eagerly: one full row at the widest grid. */
const EAGER_POSTERS = 6;

/**
 * One URL per page and tab: `type` always, as every navbar link writes it,
 * and `page` from page 2, as on `/movies`.
 */
function pageHref(list: LibraryList, type: MediaType, page: number): string {
  return typedHref(`/${list}`, type, { page });
}

/** The page names a bad `type` panel sends the user back to. */
const LIST_NAMES = {
  watchlist: "Watchlist",
  upcoming: "Upcoming",
  watched: "Watched",
} as const;

/**
 * Everything on a library page below its heading (spec 0020, AC-8 to AC-18;
 * spec 0008 for the shared states). It streams behind the page's Suspense
 * boundary, because it reads the session, the search params and the user's
 * rows. It lists one media type, the navbar tab's `type` parameter
 * (feature 22).
 *
 * The order is deliberate. `requireUser()` first, so a request that got past
 * the proxy still receives no list data. Then the type and page parameters,
 * so a malformed value never costs a query. Then today, read once for the
 * request (AC-22), and the tab's own read: a classified tab for shows and for
 * planned movies, the plain watched query for watched movies (AC-16). A
 * redirect when the page is past the end, outside any `try`.
 *
 * Nothing here writes (AC-21). A failure of any read replaces the grid with
 * an error panel and a retry link, never the empty state, which would tell
 * the user their list is gone.
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

  const today = requestTodayUtc();
  if (type === "tv") {
    return showTab({ list, userId: user.id, page, today });
  }
  if (list === "watched") {
    return watchedMoviesTab({ userId: user.id, page });
  }
  return movieTab({ list, userId: user.id, page, today });
}

/**
 * A show tab (AC-9 to AC-12, AC-15 to AC-18): Watchlist with Mark watched
 * cards and, on page 1, the Paused & dropped section; Upcoming with dated and
 * Date TBA cards; Watched with the calculated rating and its label.
 */
async function showTab({
  list,
  userId,
  page,
  today,
}: {
  list: LibraryList;
  userId: string;
  page: number;
  today: string;
}) {
  const tab = await getShowLibraryTab(userId, list, page, today);
  const settled = settleTab(tab, list, "tv", page);
  if (settled.kind !== "ok") return settled.panel;
  const { cards, total, lastPage } = settled;

  // Below the grid on page 1 only, and its own boundary, so the grid never
  // waits on the held shows' titles (AC-10).
  const held =
    list === "watchlist" && page === 1 ? (
      <Suspense fallback={null}>
        <HeldShowsSection userId={userId} />
      </Suspense>
    ) : null;

  if (total === 0) {
    return (
      <div className="flex flex-col gap-10">
        <TabNotes tab={settled} type="tv" list={list} page={page} />
        <EmptyPanel list={list} type="tv" />
        {held}
      </div>
    );
  }

  // A watched show's badge comes from its episode ratings. A failed read
  // shows the list panel rather than cards that look unrated (spec 0019,
  // AC-10).
  let ratings = new Map<number, number | null>();
  if (list === "watched") {
    const ids = cards.flatMap((card) =>
      card.kind === "watched" ? [card.showId] : [],
    );
    const read = await getShowRatings(userId, ids);
    if (read.kind === "failed") {
      return <ListFailed list={list} type="tv" page={page} />;
    }
    ratings = read.ratings;
  }

  return (
    <div className="flex flex-col gap-10">
      <TabNotes tab={settled} type="tv" list={list} page={page} />
      <PosterGrid aria-label={`${LIBRARY_COPY[list].tv.grid}, page ${page}`}>
        {cards.map((card, index) => {
          const itemId = `library-show-item-${card.showId}`;
          return (
            <li key={card.showId} id={itemId}>
              <ShowTabCardView
                card={card}
                itemId={itemId}
                today={today}
                rating={ratings.get(card.showId) ?? null}
                priority={index < EAGER_POSTERS}
              />
            </li>
          );
        })}
      </PosterGrid>

      {lastPage > 1 ? (
        <PaginationLinks
          page={page}
          lastPage={lastPage}
          href={(target) => pageHref(list, "tv", target)}
        />
      ) : null}

      {held}

      <BadgeLegend list={list} type="tv" />
    </div>
  );
}

function ShowTabCardView({
  card,
  itemId,
  today,
  rating,
  priority,
}: {
  card: ShowTabCard;
  itemId: string;
  today: string;
  rating: number | null;
  priority: boolean;
}) {
  switch (card.kind) {
    case "watchlist":
      return (
        <WatchlistShowCard
          showId={card.showId}
          title={card.title}
          next={card.next}
          priority={priority}
        />
      );
    case "upcoming":
      return (
        <UpcomingShowCard
          showId={card.showId}
          title={card.title}
          airDate={card.airDate}
          next={card.next}
          today={today}
          priority={priority}
        />
      );
    case "watched":
      return (
        <WatchedShowCard
          showId={card.showId}
          title={card.title}
          label={card.label}
          showRating={rating}
          priority={priority}
        />
      );
    case "missing":
      return (
        <MissingShowCard
          showId={card.showId}
          itemId={itemId}
          fallbackId={LIBRARY_HEADING_ID}
        />
      );
  }
}

/**
 * A planned movie tab, Watchlist or Upcoming (AC-13, AC-15 to AC-18), on the
 * movie grid with its removal and Undo.
 */
async function movieTab({
  list,
  userId,
  page,
  today,
}: {
  list: MovieTab;
  userId: string;
  page: number;
  today: string;
}) {
  const tab = await getMovieLibraryTab(userId, list, page, today);
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
  if (card.kind === "missing") {
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
  if (card.kind === "watchlist" || card.releaseDate === null) return base;
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
async function watchedMoviesTab({
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

/** A classified tab that read, with its last page. */
type SettledTab<Card> = {
  kind: "ok";
  cards: Card[];
  total: number;
  lastPage: number;
  failedCount: number;
  capped: boolean;
};

/**
 * A classified tab's read, as the page uses it: its cards and last page, or
 * the panel that replaces them. A page past the end redirects to the last
 * page (AC-16); a systemic TMDB failure is the existing failed panel with
 * Retry (AC-17).
 */
function settleTab<Card>(
  tab: LibraryTab<Card>,
  list: LibraryList,
  type: MediaType,
  page: number,
): SettledTab<Card> | { kind: "panel"; panel: ReactNode } {
  if (tab.kind === "failed") {
    return {
      kind: "panel",
      panel: <ListFailed list={list} type={type} page={page} />,
    };
  }
  if (tab.kind === "tmdb_failed") {
    return {
      kind: "panel",
      panel: <TmdbFailed href={pageHref(list, type, page)} />,
    };
  }
  const lastPage = libraryLastPage(tab.total);
  if (page > lastPage) redirect(pageHref(list, type, lastPage));
  return { ...tab, lastPage };
}

/**
 * The notes above a classified tab (AC-16, AC-17): the ceiling, when it left
 * older titles unchecked, and the titles whose own TMDB read failed, with a
 * Retry that reloads the route. Both show on every tab of the media type,
 * because each tab classifies the same titles.
 */
function TabNotes({
  tab,
  type,
  list,
  page,
}: {
  tab: { capped: boolean; failedCount: number };
  type: MediaType;
  list: LibraryList;
  page: number;
}) {
  if (!tab.capped && tab.failedCount === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {tab.capped ? (
        <p className="text-sm text-text-secondary">
          {LIBRARY_NOTES.checked(LIBRARY_CLASSIFY_LIMIT, type)}
        </p>
      ) : null}
      {tab.failedCount > 0 ? (
        <div role="status" className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-text-secondary">
            {LIBRARY_NOTES.failed(tab.failedCount, type)}
          </p>
          <RetryLink href={pageHref(list, type, page)} />
        </div>
      ) : null}
    </div>
  );
}

function EmptyPanel({ list, type }: { list: LibraryList; type: MediaType }) {
  const copy = LIBRARY_COPY[list][type];
  return (
    <div className="py-12">
      <StatePanel
        variant="empty"
        title={copy.empty.title}
        description={copy.empty.description}
        action={
          <ButtonLink size="touch" href={CATALOG_PATHS[type]}>
            {copy.browse}
          </ButtonLink>
        }
      />
    </div>
  );
}

/**
 * Shown for a malformed page number or media type, before any read (spec
 * 0008, AC-9; feature 22). Never a silent redirect: the link was wrong, and
 * the panel says which part. A bad page keeps its tab; a bad type leads to
 * the default one.
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
      title={LIBRARY_COPY[list].failed}
      description="Your list didn't load. Try again in a moment."
      href={pageHref(list, type, page)}
    />
  );
}

/** A systemic TMDB failure: a rejected credential or a rate limit (AC-17). */
function TmdbFailed({ href }: { href: string }) {
  return (
    <LoadFailed
      title="Couldn't reach TMDB"
      description="TMDB didn't respond, so the titles couldn't load. Try again in a moment."
      href={href}
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

/** The static shell's stand in for the list, at the same footprint. */
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
