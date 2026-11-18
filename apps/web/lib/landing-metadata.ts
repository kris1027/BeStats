import type { Metadata } from "next";
import { type CatalogList, listPageHref } from "@/lib/catalog/lists";
import { parsePageParam } from "@/lib/catalog/pages";
import {
  lastListPage,
  readTaggedCatalogGridPage,
} from "@/lib/catalog-list-read";
import { IgdbError } from "@/lib/igdb";
import { landingMetadata } from "@/lib/seo/metadata";
import { TmdbError } from "@/lib/tmdb";

/**
 * The shared `generateMetadata` flow of a paged catalog list (spec 0016,
 * AC-17; since spec 0021 the list pages, through `catalogListMetadata`
 * below): parse `page`, read the same cached call the page body makes, and
 * index the page only when it shows results.
 *
 * It lives outside `lib/seo/` because it touches TMDB and IGDB at runtime (it
 * catches `TmdbError` and `IgdbError`), and `lib/seo/AGENTS.md` keeps that
 * folder free of both; `lib/catalog/` stays pure for the proxy for the same
 * reason. The caller passes its own discover read, so the request is the very
 * call the body makes and shares its cache entry: metadata costs no extra
 * request.
 *
 * The page is indexed when the read shows results and the page is not past
 * a known last page (spec 0032, AC-5). A games discover list may have no
 * count, so `lastPage` is null there and "has results" alone decides. An
 * invalid page, an empty page, a page past the last, or a failed read is
 * `noindex` with no canonical. Only a `TmdbError` or an `IgdbError` counts as
 * a failed read; anything else, `IgdbValidationError` included, is a bug and
 * is rethrown.
 */
export async function landingPageMetadata({
  pageParam,
  discover,
  title,
  description,
  pageHref,
}: {
  pageParam: string | string[] | undefined;
  discover: (input: {
    page: number;
  }) => Promise<{ hasResults: boolean; lastPage: number | null }>;
  title: string;
  description: string;
  pageHref: (page: number) => string;
}): Promise<Metadata> {
  const noindex = () => landingMetadata({ title, description, path: null });

  const page = parsePageParam(pageParam);
  if (page === null) return noindex();

  try {
    const { hasResults, lastPage } = await discover({ page });
    if (!hasResults || (lastPage !== null && page > lastPage)) {
      return noindex();
    }
    return landingMetadata({ title, description, path: pageHref(page) });
  } catch (error) {
    if (error instanceof TmdbError || error instanceof IgdbError) {
      return noindex();
    }
    throw error;
  }
}

/**
 * A list page's metadata (spec 0021, AC-15; games since spec 0032, AC-5): its
 * h1 as the title, its note as the description, and page N's own canonical.
 * The `landingPageMetadata` flow with the See all grid's own read as the read,
 * the very call the page body makes, so metadata costs no extra TMDB or IGDB
 * request and follows the 24 title page count (spec 0022, AC-21).
 *
 * A TMDB list always knows its last page, so "has results" is just "not past
 * it", exactly the rule before games. A games list has results when its page
 * holds a game; with no IGDB count its last page is unknown.
 */
export async function catalogListMetadata(
  list: CatalogList,
  searchParams: Promise<Record<string, string | string[] | undefined>>,
): Promise<Metadata> {
  return landingPageMetadata({
    pageParam: (await searchParams).page,
    discover: async ({ page }) => {
      const result = await readTaggedCatalogGridPage(list, page);
      const lastPage = lastListPage(result);
      return {
        hasResults:
          result.mediaType === "game"
            ? result.paged.results.length > 0
            : page <= (lastPage ?? 0),
        lastPage,
      };
    },
    title: list.heading,
    description: list.note,
    pageHref: (page) => listPageHref(list, page),
  });
}

/**
 * `/games` metadata (spec 0032, AC-4): its title and description, the
 * canonical `/games` and the site card, like the `/movies` and `/shows`
 * landings. The landing is not paged, so it reads neither `?page` nor IGDB.
 */
export function gamesMetadata({
  title,
  description,
}: {
  title: string;
  description: string;
}): Metadata {
  return landingMetadata({ title, description, path: "/games" });
}
