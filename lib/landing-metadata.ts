import type { Metadata } from "next";
import { type CatalogList, listPageHref } from "@/lib/catalog/lists";
import { lastReachablePage, parsePageParam } from "@/lib/catalog/pages";
import { readCatalogGridPage } from "@/lib/catalog-list-read";
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
 * An invalid page, a page past `lastReachablePage`, or a failed TMDB read is
 * `noindex` with no canonical. Only a `TmdbError` counts as a failed read;
 * anything else is a bug and is rethrown.
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
    if (page > lastReachablePage(totalPages)) return noindex();
    return landingMetadata({ title, description, path: pageHref(page) });
  } catch (error) {
    if (!(error instanceof TmdbError)) throw error;
    return noindex();
  }
}

/**
 * A list page's metadata (spec 0021, AC-15): its h1 as the title, its note as
 * the description, and page N's own canonical. The `landingPageMetadata` flow
 * with `readCatalogGridPage` as the read, the very call the page body makes,
 * so metadata costs no extra TMDB request and follows the 24 title page count
 * (spec 0022, AC-21).
 */
export async function catalogListMetadata(
  list: CatalogList,
  searchParams: Promise<Record<string, string | string[] | undefined>>,
): Promise<Metadata> {
  return landingPageMetadata({
    pageParam: (await searchParams).page,
    discover: ({ page }) => readCatalogGridPage(list, page),
    title: list.heading,
    description: list.note,
    pageHref: (page) => listPageHref(list, page),
  });
}
