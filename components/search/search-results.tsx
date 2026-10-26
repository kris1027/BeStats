import { Suspense } from "react";

import { GameListCard } from "@/components/catalog/list-cards";
import { PaginationLinks } from "@/components/pagination-links";
import { PosterCard } from "@/components/poster-card";
import { POSTER_GRID_EAGER, PosterGrid } from "@/components/poster-grid";
import { TmdbRatingBadge } from "@/components/rating-badges";
import { RetryLink } from "@/components/retry-link";
import {
  PaginationSkeleton,
  PosterCardSkeleton,
  Skeleton,
} from "@/components/skeleton";
import { StatePanel } from "@/components/state-panel";
import {
  MovieCardBadge,
  MovieCardControls,
} from "@/components/tracking/movie-card-slots";
import {
  ShowCardBadge,
  ShowCardControls,
  ShowCardMeta,
} from "@/components/tracking/show-card-slots";
import { ButtonLink } from "@/components/ui/button";
import { GRID_PAGE_SIZE } from "@/lib/catalog/grid-page";
import {
  CATALOG_SOURCES,
  type LibraryType,
  parseLibraryTypeParam,
  titleHref,
  typedHref,
} from "@/lib/catalog/media-type";
import { gameHasNextPage, lastGamePage } from "@/lib/catalog-list-read";
import {
  type GameRef,
  type GameSummary,
  getGameGenres,
  getGamePlatforms,
  IgdbError,
  type Paged as IgdbPaged,
} from "@/lib/igdb";
import { SEARCH_CATALOGS } from "@/lib/search/catalogs";
import { formatRange, mediaNoun } from "@/lib/search/count";
import { readGameSearchPage } from "@/lib/search/game-read";
import { gameSearchEnabled } from "@/lib/search/games-flag";
import { searchMode } from "@/lib/search/mode";
import {
  type GameSearchParams,
  parseSearchParams,
  type SearchParamName,
  type SearchParams,
  type SearchType,
  searchHref,
  type TmdbSearchParams,
} from "@/lib/search/params";
import {
  readSearchGridPage,
  type SearchPage,
  type SearchResult,
} from "@/lib/search/read";
import { scanFilteredSearch } from "@/lib/search/scan";
import { type Genre, getMovieGenres, getTvGenres, TmdbError } from "@/lib/tmdb";

import { FilteredPaging } from "./filtered-paging";
import { ResultCount } from "./result-count";

type RawParams = Record<string, string | string[] | undefined>;

/**
 * The results half of `/search`, for one URL (spec 0010, AC-11 to AC-19).
 *
 * The URL is parsed before any TMDB result call: an invalid value gets the
 * invalid filter panel and TMDB is asked only for the genre list it needs to
 * check genre ids against (AC-18). Then the mode picks the one read that can
 * answer truthfully: discover for browse and discover, one search page for
 * plain search, and the page scan for a query with a genre or rating
 * (`scanFilteredSearch`).
 *
 * Every TMDB failure lands here, inside the keyed Suspense boundary, so the
 * heading and the filter bar above stay usable (AC-19). No session is read,
 * except by each card's bookmark in its own boundary (AC-16, AC-22; spec
 * 0013, AC-18).
 *
 * `type=game` counts only while the games library is on, and the flag is read
 * only for that raw value, so an invalid flag can never take a show or movie
 * search down (spec 0029, AC-1). A games search has its own branch.
 */
async function SearchResults({ raw }: { raw: RawParams }) {
  const gamesEnabled = gameSearchEnabled(raw.type);
  const type = parseLibraryTypeParam(raw.type, gamesEnabled);
  if (type === null) return <InvalidFilter param="type" type={null} />;

  const retryHref = rawHref(raw);
  if (type === "game") return GameResults({ raw, retryHref });

  // Both this and the filter bar read the same cached genre list, so they
  // agree within one render (AC-19).
  let genres: Genre[] = [];
  try {
    genres = type === "movie" ? await getMovieGenres() : await getTvGenres();
  } catch (error) {
    if (!(error instanceof TmdbError)) throw error;
    // Without the list a genre id cannot be checked, so only a URL that has
    // one needs it.
    if (raw.genre !== undefined) {
      return <CatalogFailure type={type} retryHref={retryHref} />;
    }
  }

  // Read at request time, after the URL, so the year range is never baked
  // into a prerendered shell.
  const parsed = parseSearchParams(
    raw,
    { genres },
    new Date().getUTCFullYear(),
  );
  if (!parsed.ok) return <InvalidFilter param={parsed.param} type={type} />;
  // The raw type was not `game`, so neither is the parsed one.
  const params = parsed.params as TmdbSearchParams;

  try {
    const mode = searchMode(params);
    if (mode === "filtered_search") return await FilteredResults({ params });

    const page = await readSearchGridPage(mode, params);
    return (
      <PagedResults
        params={params}
        page={page}
        endpoint={mode === "search" ? "search" : "discover"}
        browse={mode === "browse"}
      />
    );
  } catch (error) {
    if (!(error instanceof TmdbError)) throw error;
    return <CatalogFailure type={type} retryHref={retryHref} />;
  }
}

/** A reference list, or null when IGDB could not supply it (spec 0029, AC-11). */
async function settleGameList(read: () => Promise<GameRef[]>) {
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof IgdbError)) throw error;
    return null;
  }
}

/**
 * The games half of `/search` (spec 0029, AC-2 to AC-8, AC-11 to AC-13).
 *
 * The URL is parsed against IGDB's cached genre and platform lists before
 * any result request. A list that failed only matters when the URL names an
 * id from it, which then cannot be checked. A page above IGDB's 50 is
 * answered before any request. Every filter goes to IGDB, so the count is
 * IGDB's own, or left out when it sent none.
 */
async function GameResults({
  raw,
  retryHref,
}: {
  raw: RawParams;
  retryHref: string;
}) {
  const [genres, platforms] = await Promise.all([
    settleGameList(getGameGenres),
    settleGameList(getGamePlatforms),
  ]);
  if (
    (genres === null && raw.genre !== undefined) ||
    (platforms === null && raw.platform !== undefined)
  ) {
    return <CatalogFailure type="game" retryHref={retryHref} />;
  }

  const parsed = parseSearchParams(
    raw,
    { genres: genres ?? [], platforms: platforms ?? [] },
    new Date().getUTCFullYear(),
    true,
  );
  if (!parsed.ok) return <InvalidFilter param={parsed.param} type="game" />;
  // The raw type was `game`, so the parsed one is too.
  const params = parsed.params as GameSearchParams;
  if (params.page > SEARCH_CATALOGS.game.maxPage)
    return <NoSuchPage params={params} />;

  const mode = searchMode(params);
  if (mode === "filtered_search")
    throw new Error("Games never filter locally.");

  let paged: IgdbPaged<GameSummary>;
  try {
    paged = await readGameSearchPage(mode, params);
  } catch (error) {
    if (!(error instanceof IgdbError)) throw error;
    return <CatalogFailure type="game" retryHref={retryHref} />;
  }

  const lastPage = lastGamePage(paged);
  if (paged.results.length === 0) {
    if (params.page > 1) return <NoSuchPage params={params} />;
    return mode === "browse" ? (
      <NoPopularGames />
    ) : (
      <NoMatches params={params} />
    );
  }
  if (lastPage !== null && params.page > lastPage) {
    return <NoSuchPage params={params} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {mode === "browse" ? (
        <ResultCount kind="browse" type="game" />
      ) : paged.totalResults !== null ? (
        <ResultCount
          kind="exact"
          type="game"
          total={paged.totalResults}
          endpoint="igdb"
        />
      ) : null}
      <PosterGrid aria-label="Search results">
        {paged.results.map((game, index) => (
          <li key={game.id}>
            <GameListCard
              game={game}
              meta={game.releaseYear ?? undefined}
              priority={index < POSTER_GRID_EAGER.catalog}
            />
          </li>
        ))}
      </PosterGrid>
      <PaginationLinks
        page={params.page}
        lastPage={lastPage}
        hasNextPage={gameHasNextPage(paged, params.page)}
        href={(number) => searchHref(params, { page: number })}
      />
    </div>
  );
}

/** Browse with IGDB's Popular list empty: nothing to clear (spec 0029, AC-4). */
function NoPopularGames() {
  return (
    <div className="py-12">
      <StatePanel
        variant="empty"
        title="No popular games right now"
        description="IGDB lists no popular games at the moment."
      />
    </div>
  );
}

/**
 * Browse, discover and plain search: numbered 24 title pages over TMDB's
 * (AC-11, AC-12; spec 0022, AC-21).
 */
function PagedResults({
  params,
  page,
  endpoint,
  browse,
}: {
  params: TmdbSearchParams;
  page: SearchPage;
  endpoint: "search" | "discover";
  browse: boolean;
}) {
  const lastPage = page.totalPages;
  if (params.page > Math.max(lastPage, 1)) {
    return <NoSuchPage params={params} />;
  }
  if (page.totalResults === 0 || page.results.length === 0) {
    return <NoMatches params={params} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {browse ? (
        <ResultCount kind="browse" type={params.type} />
      ) : (
        <ResultCount
          kind="exact"
          type={params.type}
          total={page.totalResults}
          endpoint={endpoint}
        />
      )}
      <ResultGrid params={params} results={page.results} />
      <PaginationLinks
        page={params.page}
        lastPage={lastPage}
        href={(number) => searchHref(params, { page: number })}
      />
    </div>
  );
}

/** A query with a genre or rating: the page scan and its cursor (AC-13 to AC-15). */
async function FilteredResults({ params }: { params: TmdbSearchParams }) {
  const scan = await scanFilteredSearch(params);
  if (scan.kind === "no_such_page") return <NoSuchPage params={params} />;
  if (scan.totalResults === 0) return <NoMatches params={params} />;

  const moreHref =
    scan.nextPage !== null ? searchHref(params, { page: scan.nextPage }) : null;
  const firstHref = params.page > 1 ? searchHref(params, { page: 1 }) : null;

  if (scan.results.length === 0) {
    // Nothing kept in the pages read is not "nothing matches": say which
    // results were checked, and offer the rest (AC-15).
    return (
      <div className="flex flex-col gap-6 py-12">
        <StatePanel
          variant="empty"
          title={`No matches in TMDB results ${formatRange(scan.fromIndex, scan.toIndex)}`}
          description={`None of these results for “${params.q}” fit your filters.${moreHref ? " Later results might." : ""}`}
        />
        <FilteredPaging moreHref={moreHref} firstHref={firstHref} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ResultCount
        kind="partial"
        matches={scan.results.length}
        fromIndex={scan.fromIndex}
        toIndex={scan.toIndex}
        totalResults={scan.totalResults}
        query={params.q ?? ""}
      />
      <ResultGrid params={params} results={scan.results} />
      <FilteredPaging moreHref={moreHref} firstHref={firstHref} />
    </div>
  );
}

/**
 * The poster grid, the same cards as the landings (AC-16). Every card carries
 * the bookmark its landing does, movie or TV (spec 0013, AC-18), returning to
 * this search's canonical URL.
 */
function ResultGrid({
  params,
  results,
}: {
  params: TmdbSearchParams;
  results: SearchResult[];
}) {
  const returnPath = searchHref(params);
  // One type per results page, so these are the grid's movie or show ids.
  const gridIds = results.map((result) => result.id);
  const ResultCard = params.type === "movie" ? MovieResultCard : ShowResultCard;

  return (
    <PosterGrid aria-label="Search results">
      {results.map((result, index) => (
        <li key={result.id}>
          <ResultCard
            result={result}
            gridIds={gridIds}
            returnPath={returnPath}
            priority={index < POSTER_GRID_EAGER.catalog}
          />
        </li>
      ))}
    </PosterGrid>
  );
}

type ResultCardProps = {
  result: SearchResult;
  /** Every id on the results page, the same array for each card. */
  gridIds: readonly number[];
  returnPath: string;
  priority: boolean;
};

/** A movie result, carrying the slots `/movies` gives the same card. */
function MovieResultCard({
  result,
  gridIds,
  returnPath,
  priority,
}: ResultCardProps) {
  return (
    <PosterCard
      title={result.title}
      posterUrl={result.posterUrl}
      href={titleHref("movie", result.id)}
      meta={result.year ?? undefined}
      badge={
        <Suspense fallback={<TmdbRatingBadge value={result.tmdbRating} />}>
          <MovieCardBadge
            movieId={result.id}
            releaseDate={result.releaseDate}
            tmdbRating={result.tmdbRating}
            gridMovieIds={gridIds}
          />
        </Suspense>
      }
      controls={
        <Suspense fallback={null}>
          <MovieCardControls
            movieId={result.id}
            title={result.title}
            releaseDate={result.releaseDate}
            gridMovieIds={gridIds}
            returnPath={returnPath}
          />
        </Suspense>
      }
      priority={priority}
    />
  );
}

/**
 * A TV result, carrying the slots `/shows` gives the same card, with the
 * first air year ahead of a Watched show's label on the meta line.
 */
function ShowResultCard({
  result,
  gridIds,
  returnPath,
  priority,
}: ResultCardProps) {
  const year = result.year === null ? null : String(result.year);
  return (
    <PosterCard
      title={result.title}
      posterUrl={result.posterUrl}
      href={titleHref("tv", result.id)}
      meta={
        <Suspense fallback={year}>
          <ShowCardMeta showId={result.id} base={year} gridShowIds={gridIds} />
        </Suspense>
      }
      badge={
        <Suspense fallback={<TmdbRatingBadge value={result.tmdbRating} />}>
          <ShowCardBadge
            showId={result.id}
            tmdbRating={result.tmdbRating}
            gridShowIds={gridIds}
          />
        </Suspense>
      }
      controls={
        <Suspense fallback={null}>
          <ShowCardControls
            showId={result.id}
            name={result.title}
            gridShowIds={gridIds}
            returnPath={returnPath}
          />
        </Suspense>
      }
      priority={priority}
    />
  );
}

/** What to loosen when filters match nothing; games have platforms too. */
const FILTERED_HINTS = {
  tv: "Try fewer genres, another year or a lower rating.",
  movie: "Try fewer genres, another year or a lower rating.",
  game: "Try fewer genres or platforms, another year or a lower rating.",
} as const satisfies Record<SearchType, string>;

/**
 * The two empty answers of AC-15: a query alone, or any filter. A games
 * search names platforms too (spec 0029, AC-13).
 */
function NoMatches({ params }: { params: SearchParams }) {
  const noun = mediaNoun(params.type);
  const filtered =
    params.genreIds.length > 0 ||
    params.platformIds.length > 0 ||
    params.year !== null ||
    params.rating !== null;
  return (
    <div className="py-12">
      <StatePanel
        variant="empty"
        title={
          filtered
            ? `No ${noun} match these filters`
            : `No ${noun} match “${params.q}”`
        }
        description={
          filtered
            ? FILTERED_HINTS[params.type]
            : "Check the spelling, or try a shorter title."
        }
        action={<ClearFilters type={params.type} />}
      />
    </div>
  );
}

/** A malformed or unknown value in the URL, named (AC-18). */
function InvalidFilter({
  param,
  type,
}: {
  param: SearchParamName;
  type: SearchType | null;
}) {
  return (
    <div className="py-12">
      <StatePanel
        variant="empty"
        title="That filter isn't valid"
        description={`The “${param}” value in this link isn't one we can search with.`}
        action={<ClearFilters type={type} />}
      />
    </div>
  );
}

/** A page past the last one TMDB serves, in any mode (AC-18). */
function NoSuchPage({ params }: { params: SearchParams }) {
  return (
    <div className="py-12">
      <StatePanel
        variant="empty"
        title="That page doesn't exist"
        description={`There are no ${mediaNoun(params.type)} at this page number.`}
        action={
          <ButtonLink size="touch" href={searchHref(params, { page: 1 })}>
            Back to page 1
          </ButtonLink>
        }
      />
    </div>
  );
}

/**
 * The catalog timed out, rate limited or failed, named through
 * `CATALOG_SOURCES` so a games search blames IGDB (AC-19; spec 0029, AC-13).
 */
function CatalogFailure({
  type,
  retryHref,
}: {
  type: LibraryType;
  retryHref: string;
}) {
  const source = CATALOG_SOURCES[type];
  return (
    <div className="py-12">
      <StatePanel
        variant="error"
        title={`Couldn't reach ${source}`}
        description={`${source} didn't respond. Try again in a moment.`}
        action={<RetryLink href={retryHref} />}
      />
    </div>
  );
}

function ClearFilters({ type }: { type: SearchType | null }) {
  return (
    <ButtonLink size="touch" href={typedHref("/search", type ?? "tv")}>
      Clear filters
    </ButtonLink>
  );
}

/**
 * The URL exactly as it arrived, for Try again. A failure can come before the
 * URL is known to be valid, so this is not the canonical `searchHref`.
 */
function rawHref(raw: RawParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    for (const item of [value ?? []].flat()) query.append(key, item);
  }
  const text = query.toString();
  return text ? `/search?${text}` : "/search";
}

/**
 * A stable key for one URL's results, so a filter change mounts a new
 * boundary and shows its skeleton instead of the previous results (AC-21).
 */
function resultsKey(raw: RawParams): string {
  return rawHref(
    Object.fromEntries(
      Object.entries(raw).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
}

/**
 * The loading shape of the results: the count line, 24 cards and the
 * pagination row (AC-21).
 */
function SearchResultsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton shape="line" className="h-5 w-48" />
      <PosterGrid aria-hidden="true">
        {Array.from({ length: GRID_PAGE_SIZE }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
          <li key={index}>
            <PosterCardSkeleton meta />
          </li>
        ))}
      </PosterGrid>
      <PaginationSkeleton />
    </div>
  );
}

export { resultsKey, SearchResults, SearchResultsSkeleton };
