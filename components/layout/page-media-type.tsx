import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, Suspense } from "react";

import {
  isTypedPath,
  type MediaType,
  mediaTypeForLocation,
  type TypedPath,
} from "@/lib/catalog/media-type";

/**
 * Where the visitor is, as the navbar's type aware controls need it: the
 * page's media type, null on a page about neither catalog, and on a typed
 * page its current query.
 */
type PageMediaType =
  | { pathname: TypedPath; type: MediaType | null; params: URLSearchParams }
  | { pathname: string; type: MediaType | null; params: null };

/**
 * The media type of the page being viewed, for `BrandLink` and, through
 * `WithTypedPage`, `MediaTypeTabs`, `LibraryNav` and `NavbarSearch`
 * (feature 22). It holds the one rule they share: only on
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

  return children({
    pathname,
    type: mediaTypeForLocation(pathname, null),
    params: null,
  });
}

/** A page that has a media type, as `WithTypedPage` hands it on. */
type TypedPageMediaType = PageMediaType & { type: MediaType };

/**
 * `WithPageMediaType` for a control that exists only on a page with a type:
 * the tabs, the search and the Library links render nothing on a page about
 * neither catalog (prompts/hide-tabs-without-type.md). The logo keeps
 * `WithPageMediaType`, because it still renders there.
 */
function WithTypedPage({
  children,
  fallback,
}: {
  children: (page: TypedPageMediaType) => ReactNode;
  fallback: (pathname: TypedPath) => ReactNode;
}) {
  return (
    <WithPageMediaType fallback={fallback}>
      {(page) =>
        page.type === null ? null : children({ ...page, type: page.type })
      }
    </WithPageMediaType>
  );
}

/** On a typed page the type is the page's own `type` parameter. */
function TypedPageMediaType({
  pathname,
  children,
}: {
  pathname: TypedPath;
  children: (page: PageMediaType) => ReactNode;
}) {
  const params = useSearchParams();
  return children({
    pathname,
    type: mediaTypeForLocation(pathname, params.get("type")),
    params,
  });
}

export { type PageMediaType, WithPageMediaType, WithTypedPage };
