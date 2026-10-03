import type { Metadata } from "next";

import { siteUrl } from "./site";

/**
 * The path Next.js serves the root `app/opengraph-image.tsx` at, the share
 * card a page falls back to when it has no TMDB artwork (spec 0016, AC-10).
 */
export const SITE_CARD_PATH = "/opengraph-image";

export type CatalogMetadataInput = {
  /** The raw title; the root template adds ` · BeStats` in the tab only. */
  title: string;
  /** Left undefined when TMDB has none: nothing is invented. */
  description: string | undefined;
  /** The page path, never with a query string except a landing `?page=N`. */
  path: string;
  /** An absolute TMDB image URL, or null to use the site card. */
  image: string | null;
  ogType: "website" | "video.movie" | "video.tv_show";
};

/**
 * The absolute site card URL, or null without a site URL, so a page with no
 * TMDB image and no site URL simply carries no `og:image` (spec 0016, AC-11).
 */
export function siteCardUrl(): string | null {
  const origin = siteUrl();
  return origin === null ? null : `${origin}${SITE_CARD_PATH}`;
}

/**
 * The metadata of every public catalog page: title, canonical, Open Graph and
 * X card, built in one place (spec 0016, AC-10).
 *
 * Every URL is written out absolute here rather than left relative for
 * `metadataBase` to resolve, so a missing site URL drops those fields instead
 * of failing the build (AC-3). `images` is always set explicitly, because
 * Next merges metadata shallowly and a page that sets `openGraph` would
 * otherwise lose the root layout's site card (AC-11).
 */
export function catalogMetadata({
  title,
  description,
  path,
  image,
  ogType,
}: CatalogMetadataInput): Metadata {
  const origin = siteUrl();
  const url = origin === null ? undefined : `${origin}${path}`;
  const shareImage = image ?? siteCardUrl();
  const images = shareImage === null ? undefined : [shareImage];

  return {
    title,
    description,
    alternates: url === undefined ? undefined : { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "BeStats",
      locale: "en_US",
      type: ogType,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images,
    },
  };
}

/**
 * A landing page's metadata (spec 0016, AC-17): the catalog metadata with the
 * site card when the page exists, or `noindex` with no canonical when it does
 * not (an invalid page number, one past the last page, or a failed TMDB read),
 * so neither a "That page doesn't exist" panel nor a retry panel is indexed.
 *
 * @param path The page's own address from its `pageHref`, or null when the
 * page shows no results.
 */
export function landingMetadata(
  title: string,
  description: string,
  path: string | null,
): Metadata {
  if (path === null) {
    return { title, description, robots: { index: false } };
  }
  return catalogMetadata({
    title,
    description,
    path,
    image: null,
    ogType: "website",
  });
}
