import type { Metadata } from "next";

import { absoluteUrl } from "./site";

/** The site's name: the tab title suffix and every share card's `og:site_name`. */
export const SITE_NAME = "BeStats";

/**
 * The path Next.js serves the root `app/opengraph-image.tsx` at, the share
 * card a page falls back to when it has no TMDB artwork (spec 0016, AC-10).
 */
export const SITE_CARD_PATH = "/opengraph-image";

/** What `catalogMetadata()` needs to describe one public catalog page. */
export type CatalogMetadataInput = {
  /** The raw title; the root template adds ` · BeStats` in the tab only. */
  title: string;
  /** Left undefined when TMDB has none: nothing is invented. */
  description: string | undefined;
  /** The page path, never with a query string except a landing `?page=N`. */
  path: string;
  /** An absolute TMDB image URL, or null to use the site card. */
  image: string | null;
  ogType: OgType;
};

type OgType = "website" | "video.movie" | "video.tv_show";

/**
 * The absolute site card URL, or null without a site URL, so a page with no
 * TMDB image and no site URL simply carries no `og:image` (spec 0016, AC-11;
 * `lib/seo/AGENTS.md`, Rules).
 */
export function siteCardUrl(): string | null {
  return absoluteUrl(SITE_CARD_PATH);
}

/**
 * The Open Graph and X card fields every page shares as, so the site name,
 * locale, card size and image fallback are written once (spec 0016, AC-10,
 * AC-11).
 *
 * `images` is always set, to the given image or else the site card, because
 * Next merges metadata shallowly and a page that sets `openGraph` would
 * otherwise lose the root layout's site card (`lib/seo/AGENTS.md`, Rules).
 * Without a site URL and an image it is undefined, so no `og:image` is
 * emitted rather than a relative one (AC-3).
 */
export function shareMetadata({
  title,
  description,
  url,
  type = "website",
  image = null,
}: {
  title?: string;
  description?: string;
  /** The absolute canonical; omitted on pages that have none. */
  url?: string;
  type?: OgType;
  /** An absolute TMDB image URL, or null for the site card. */
  image?: string | null;
}): Pick<Metadata, "openGraph" | "twitter"> {
  const shareImage = image ?? siteCardUrl();
  const images = shareImage === null ? undefined : [shareImage];

  return {
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: "en_US",
      type,
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
 * The metadata of every public catalog page: title, canonical, Open Graph and
 * X card, built in one place (spec 0016, AC-10; `lib/seo/AGENTS.md`, Rules).
 *
 * Every URL is written out absolute here rather than left relative for
 * `metadataBase` to resolve, so a missing site URL drops those fields instead
 * of failing the build (AC-3).
 */
export function catalogMetadata({
  title,
  description,
  path,
  image,
  ogType,
}: CatalogMetadataInput): Metadata {
  const url = absoluteUrl(path) ?? undefined;

  return {
    title,
    description,
    alternates: url === undefined ? undefined : { canonical: url },
    ...shareMetadata({ title, description, url, type: ogType, image }),
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
export function landingMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string | null;
}): Metadata {
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
