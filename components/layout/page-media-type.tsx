import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, Suspense } from "react";

import {
  isTypedPath,
  type LibraryType,
  libraryTypeForLocation,
  type MediaType,
  mediaTypeForLocation,
  type TypedPath,
} from "@/lib/catalog/media-type";
import { gamesLibraryEnabled } from "@/lib/env";

/**
 * Where the visitor is, as the navbar's type aware controls need it: the
 * page's media type, null on a page about neither catalog, and on a typed
 * page its current query.
 *
 * `type` is the TMDB catalog, null on a games page; `libraryType` is what
 * the tabs, the Library links, the search and the logo follow, which on a
 * games tab of a library page or `/search`, and on `/games` and below it, is
 * `game` while `type` is null (spec 0027, AC-4; spec 0028, AC-14 to AC-16;
 * spec 0029, AC-15).
 */
type PageMediaType =
  | {
      pathname: TypedPath;
      type: MediaType | null;
      libraryType: LibraryType | null;
      params: URLSearchParams;
    }
  | {
      pathname: string;
      type: MediaType | null;
      libraryType: LibraryType | null;
      params: null;
    };

/**
 * The media type of the page being viewed, for `BrandLink`, and through
 * `WithLibraryTypedPage` for `MediaTypeTabs`, `LibraryNav` and
 * `NavbarSearch` (feature 22; spec 0027; spec 0029). It holds the one rule they share: only on
 * a typed page is `useSearchParams` read, and only inside its own Suspense
 * boundary, because reading it anywhere else would pull `/shows`, `/movies`
 * and the title pages out of their prerendered shells (`AGENTS.md`, Commands
 * and repo facts).
 *
 * Deliberately not a `"use client"` module: it is imported only by those
 * client components, so it adds no client boundary to the shell
 * (`components/AGENTS.md`, Conventions).
 *
 * @param children Renders the control for the page.
 * @param fallback Renders the typed page's control before its query is known.
 */
function WithPageMediaType({
  children,
  fallback,
}: {
  children: (page: PageMediaType) => ReactNode;
  fallback: (pathname: TypedPath) => ReactNode;
}) {
  const pathname = usePathname();

  if (isTypedPath(pathname)) {
    return (
      <Suspense fallback={fallback(pathname)}>
        <TypedPageMediaType pathname={pathname}>{children}</TypedPageMediaType>
      </Suspense>
    );
  }

  // Only the pathname is read here, so `/games` keeps its prerendered shell.
  return children({
    pathname,
    type: mediaTypeForLocation(pathname, null),
    libraryType: libraryTypeForLocation(pathname, null, gamesLibraryEnabled()),
    params: null,
  });
}

/** A page that has a library type, as `WithLibraryTypedPage` hands it on. */
type LibraryTypedPageMediaType = PageMediaType & { libraryType: LibraryType };

/**
 * `WithPageMediaType` for the tabs, the Library links and the search, which
 * also exist on a games page and follow `game` there (spec 0027, AC-3, AC-4;
 * spec 0029, AC-15). They render nothing on a page about neither catalog
 * (prompts/hide-tabs-without-type.md); the logo keeps `WithPageMediaType`,
 * because it still renders there.
 */
function WithLibraryTypedPage({
  children,
  fallback,
}: {
  children: (page: LibraryTypedPageMediaType) => ReactNode;
  fallback: (pathname: TypedPath) => ReactNode;
}) {
  return (
    <WithPageMediaType fallback={fallback}>
      {(page) =>
        page.libraryType === null
          ? null
          : children({ ...page, libraryType: page.libraryType })
      }
    </WithPageMediaType>
  );
}

/**
 * On a typed page the type is the page's own `type` parameter. A games tab
 * has a library type and no catalog type.
 */
function TypedPageMediaType({
  pathname,
  children,
}: {
  pathname: TypedPath;
  children: (page: PageMediaType) => ReactNode;
}) {
  const params = useSearchParams();
  const typeParam = params.get("type");
  const libraryType = libraryTypeForLocation(
    pathname,
    typeParam,
    gamesLibraryEnabled(),
  );
  return children({
    pathname,
    type:
      libraryType === "game" ? null : mediaTypeForLocation(pathname, typeParam),
    libraryType,
    params,
  });
}

export { type PageMediaType, WithLibraryTypedPage, WithPageMediaType };
