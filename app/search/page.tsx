import type { Metadata } from "next";
import { Suspense } from "react";

import {
  SearchFilters,
  SearchFiltersSkeleton,
} from "@/components/search/search-filters";
import {
  resultsKey,
  SearchResults,
  SearchResultsSkeleton,
} from "@/components/search/search-results";
import { MAX_QUERY_LENGTH } from "@/lib/search/constants";

/**
 * `“dune” · Search` with a query, `Search` without, through the root layout's
 * template, and never indexed: a results page per query would be endless thin
 * content (spec 0010, AC-22).
 */
export async function generateMetadata({
  searchParams,
}: PageProps<"/search">): Promise<Metadata> {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const valid = query !== "" && query.length <= MAX_QUERY_LENGTH;
  return {
    title: valid ? `“${query}” · Search` : "Search",
    robots: { index: false, follow: true },
  };
}

/**
 * The search results page (spec 0010, AC-7 to AC-22).
 *
 * Public: nothing here reads a cookie, a header or the session, except each
 * movie card's bookmark in its own Suspense boundary, exactly as on `/movies`.
 * The heading is static, so the route serves a prerendered shell; the filter
 * bar and the results read the URL, so each streams inside its own boundary
 * behind a skeleton of the same footprint (AC-21).
 *
 * The results boundary is keyed on the URL. A change from the filter bar is a
 * transition, which would otherwise keep showing the previous results until
 * the new ones arrive; a new key mounts a new boundary, so the skeleton shows
 * instead.
 */
export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl leading-tight font-bold tracking-[-0.03em] text-foreground md:text-4xl">
          Search
        </h1>
      </header>

      <Suspense fallback={<SearchFiltersSkeleton />}>
        <FiltersForUrl searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<SearchResultsSkeleton />}>
        <ResultsForUrl searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function FiltersForUrl({
  searchParams,
}: {
  searchParams: PageProps<"/search">["searchParams"];
}) {
  return <SearchFilters raw={await searchParams} />;
}

async function ResultsForUrl({
  searchParams,
}: {
  searchParams: PageProps<"/search">["searchParams"];
}) {
  const raw = await searchParams;
  return (
    <Suspense key={resultsKey(raw)} fallback={<SearchResultsSkeleton />}>
      <SearchResults raw={raw} />
    </Suspense>
  );
}
