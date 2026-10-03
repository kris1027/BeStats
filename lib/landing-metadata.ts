import type { Metadata } from "next";

import { lastReachablePage, parsePageParam } from "@/lib/catalog/pages";
import { landingMetadata } from "@/lib/seo/metadata";
import { TmdbError } from "@/lib/tmdb";

/**
 * The shared `generateMetadata` flow of the `/movies` and `/shows` landings
 * (spec 0016, AC-17): parse `page`, read the same cached discover call the
 * page body makes, and index the page only when it shows results.
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
