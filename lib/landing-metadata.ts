import type { Metadata } from "next";
import {
  type GameCatalogList,
  listPageHref,
  type TmdbCatalogList,
} from "@/lib/catalog/lists";
import { parsePageParam } from "@/lib/catalog/pages";
import {
  lastListPage,
  readTaggedCatalogGridPage,
} from "@/lib/catalog-list-read";
import { landingMetadata } from "@/lib/seo/metadata";
import { TmdbError } from "@/lib/tmdb";

/**
 * The shared `generateMetadata` flow of a paged catalog list (spec 0016,
 * AC-17; since spec 0021 the list pages, through `catalogListMetadata`
 * below): parse `page`, read the same cached call the page body makes, and
 * index the page only when it shows results.
 *
 * It lives outside `lib/seo/` because it touches TMDB at runtime (it catches
 * `TmdbError`), and `lib/seo/AGENTS.md` keeps that folder free of TMDB
 * imports; `lib/catalog/` stays pure for the proxy for the same reason. The
 * caller passes its own discover read, so the request is the very call the
 * body makes and shares its cache entry: metadata costs no extra TMDB request.
 *
 * An invalid page, a page past the read's own `totalPages` (already capped by
 * the 24 title grid, spec 0022, AC-21), or a failed TMDB read is `noindex`
 * with no canonical. Only a `TmdbError` counts as a failed read; anything
 * else is a bug and is rethrown.
 */
export async function landingPageMetadata({
  pageParam,
  discover,
  title,
  description,
  pageHref,
}: {
  pageParam: string | string[] | undefined;
  discover: (input: { page: number }) => Promise<{ totalPages: number }>;
  title: string;
  description: string;
  pageHref: (page: number) => string;
}): Promise<Metadata> {
  const noindex = () => landingMetadata({ title, description, path: null });

  const page = parsePageParam(pageParam);
  if (page === null) return noindex();

  try {
    const { totalPages } = await discover({ page });
    if (page > totalPages) return noindex();
    return landingMetadata({ title, description, path: pageHref(page) });
  } catch (error) {
    if (!(error instanceof TmdbError)) throw error;
    return noindex();
  }
}

/**
 * A list page's metadata (spec 0021, AC-15): its h1 as the title, its note as
 * the description, and page N's own canonical. The `landingPageMetadata` flow
 * with the See all grid's own read as the read, the very call the page body makes,
 * so metadata costs no extra TMDB request and follows the 24 title page count
 * (spec 0022, AC-21).
 */
export async function catalogListMetadata(
  list: TmdbCatalogList,
  searchParams: Promise<Record<string, string | string[] | undefined>>,
): Promise<Metadata> {
  return landingPageMetadata({
    pageParam: (await searchParams).page,
    discover: async ({ page }) => ({
      totalPages:
        lastListPage(await readTaggedCatalogGridPage(list, page)) ?? 0,
    }),
    title: list.heading,
    description: list.note,
    pageHref: (page) => listPageHref(list, page),
  });
}

/**
 * A games page's metadata (spec 0028, AC-13): its title and description, and
 * `noindex` with no canonical and no share card of its own, until G10 opens
 * games to search engines. Static: it reads neither `?page` nor IGDB, so it
 * costs no request and holds for every page of a list.
 */
export function gamesMetadata({
  title,
  description,
}: {
  title: string;
  description: string;
}): Metadata {
  return landingMetadata({ title, description, path: null });
}

/** `gamesMetadata` for one games list page: its h1 and its note. */
export function gameListMetadata(list: GameCatalogList): Metadata {
  return gamesMetadata({ title: list.heading, description: list.note });
}
