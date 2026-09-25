import { Suspense } from "react";

import { PaginationLinks } from "@/components/pagination-links";
import { PosterCard } from "@/components/poster-card";
import { PosterGrid } from "@/components/poster-grid";
import { TmdbRatingBadge } from "@/components/rating-badges";
import { RetryLink } from "@/components/retry-link";
import { PosterCardSkeleton, Skeleton } from "@/components/skeleton";
import { StatePanel } from "@/components/state-panel";
import { CardBookmark } from "@/components/tracking/card-bookmark";
import { ButtonLink } from "@/components/ui/button";
import { lastReachablePage } from "@/lib/catalog/pages";
import { formatRange, mediaNoun } from "@/lib/search/count";
import { searchMode } from "@/lib/search/mode";
import {
  parseSearchParams,
  parseSearchType,
  type SearchParamName,
  type SearchParams,
  type SearchType,
  searchHref,
} from "@/lib/search/params";
import { titleHref } from "@/lib/search/quick";
import {
  readDiscoverPage,
  readSearchPage,
  type SearchPage,
  type SearchResult,
} from "@/lib/search/read";
import { scanFilteredSearch } from "@/lib/search/scan";
import { type Genre, getMovieGenres, getTvGenres, TmdbError } from "@/lib/tmdb";

import { FilteredPaging } from "./filtered-paging";
import { ResultCount } from "./result-count";

type RawParams = Record<string, string | string[] | undefined>;

/** TMDB's page size, which the skeleton mirrors (AC-21). */
const PAGE_SIZE = 20;

/** One full row at the widest grid loads its posters eagerly. */
const EAGER_POSTERS = 6;

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
 * except by each movie card's bookmark in its own boundary (AC-16, AC-22).
 */
async function SearchResults({ raw }: { raw: RawParams }) {
  const type = parseSearchType(raw.type);
  if (type === null) return <InvalidFilter param="type" type={null} />;

  const retryHref = rawHref(raw);

  // Both this and the filter bar read the same cached genre list, so they
  // agree within one render (AC-19).
  let genres: Genre[] = [];
  try {
    genres = type === "movie" ? await getMovieGenres() : await getTvGenres();
  } catch (error) {
    if (!(error instanceof TmdbError)) throw error;
    // Without the list a genre id cannot be checked, so only a URL that has
    // one needs it.
    if (raw.genre !== undefined) return <TmdbFailure retryHref={retryHref} />;
  }

  // Read at request time, after the URL, so the year range is never baked
  // into a prerendered shell.
  const parsed = parseSearchParams(raw, genres, new Date().getUTCFullYear());
  if (!parsed.ok) return <InvalidFilter param={parsed.param} type={type} />;
  const params = parsed.params;

  try {
    const mode = searchMode(params);
    if (mode === "filtered_search") return await FilteredResults({ params });

    const page =
      mode === "search"
        ? await readSearchPage(type, params.q ?? "", {
            year: params.year ?? undefined,
            page: params.page,
          })
        : await readDiscoverPage(params);
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
    return <TmdbFailure retryHref={retryHref} />;
  }
}

/** Browse, discover and plain search: TMDB's own numbered pages (AC-11, AC-12). */
function PagedResults({
  params,
  page,
  endpoint,
  browse,
}: {
  params: SearchParams;
  page: SearchPage;
  endpoint: "search" | "discover";
  browse: boolean;
}) {
  const lastPage = lastReachablePage(page.totalPages);
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
async function FilteredResults({ params }: { params: SearchParams }) {
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
 * The poster grid, the same cards as the landings (AC-16). Movie cards carry
 * the bookmark exactly as `/movies` does, returning to this search's canonical
 * URL; TV cards carry nothing until feature 14.
 */
function ResultGrid({
  params,
  results,
}: {
  params: SearchParams;
  results: SearchResult[];
}) {
  const returnPath = searchHref(params);
  const gridMovieIds = results.map((result) => result.id);

  return (
    <PosterGrid aria-label="Search results">
      {results.map((result, index) => (
        <li key={result.id}>
          <PosterCard
            title={result.title}
            posterUrl={result.posterUrl}
            href={titleHref(params.type, result.id)}
            meta={result.year ?? undefined}
            badge={<TmdbRatingBadge value={result.tmdbRating} />}
            controls={
              params.type === "movie" ? (
                <Suspense fallback={null}>
                  <CardBookmark
                    movieId={result.id}
                    title={result.title}
                    gridMovieIds={gridMovieIds}
                    returnPath={returnPath}
                  />
                </Suspense>
              ) : undefined
            }
            priority={index < EAGER_POSTERS}
          />
        </li>
      ))}
    </PosterGrid>
  );
}

/** The two empty answers of AC-15: a query alone, or any filter. */
function NoMatches({ params }: { params: SearchParams }) {
  const noun = mediaNoun(params.type);
  const filtered =
    params.genreIds.length > 0 ||
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
            ? "Try fewer genres, another year or a lower rating."
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

/** TMDB timed out, rate limited or failed (AC-19). */
function TmdbFailure({ retryHref }: { retryHref: string }) {
  return (
    <div className="py-12">
      <StatePanel
        variant="error"
        title="Couldn't reach TMDB"
        description="TMDB didn't respond. Try again in a moment."
        action={<RetryLink href={retryHref} />}
      />
    </div>
  );
}

function ClearFilters({ type }: { type: SearchType | null }) {
  return (
    <ButtonLink size="touch" href={type ? `/search?type=${type}` : "/search"}>
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

/** The loading shape of the results: the count line and 20 cards (AC-21). */
function SearchResultsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton shape="line" className="h-5 w-48" />
      <PosterGrid aria-hidden="true">
        {Array.from({ length: PAGE_SIZE }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
          <li key={index}>
            <PosterCardSkeleton />
          </li>
        ))}
      </PosterGrid>
    </div>
  );
}

export { resultsKey, SearchResults, SearchResultsSkeleton };
