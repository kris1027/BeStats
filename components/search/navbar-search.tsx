"use client";

import { cn } from "cn";
import { SearchIcon } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { mediaNoun } from "@/lib/search/count";
import type { SearchType } from "@/lib/search/params";

import { MobileSearchOverlay } from "./mobile-search-overlay";
import { QuickSearch } from "./quick-search";

type Layout = "desktop" | "mobile";

/**
 * Which catalog the navbar searches on a page (spec 0010, AC-1): movies under
 * `/movies`, shows under `/shows`, and shows everywhere else. `/search` is
 * decided by its `type` parameter instead, in `SearchPageNavbarSearch`.
 */
export function searchTypeForPath(pathname: string | null): SearchType {
  if (pathname === "/movies" || pathname?.startsWith("/movies/")) {
    return "movie";
  }
  return "tv";
}

/**
 * The navbar's search, the desktop field or the mobile icon (spec 0010, AC-1,
 * AC-6).
 *
 * The type follows the URL. `usePathname` suspends on a route with a dynamic
 * param at prerender time, so `Navbar` wraps this in Suspense with
 * `NavbarSearchFallback`. Only on `/search` is `useSearchParams` read, in its
 * own small boundary, because reading it anywhere else would pull `/shows`,
 * `/movies` and every other route out of their prerendered shells.
 *
 * The field is keyed on the pathname and type, so it starts empty on every
 * page (AC-17).
 */
function NavbarSearch({ layout }: { layout: Layout }) {
  const pathname = usePathname();

  if (pathname === "/search") {
    return (
      <Suspense fallback={<NavbarSearchFallback layout={layout} type="tv" />}>
        <SearchPageNavbarSearch layout={layout} />
      </Suspense>
    );
  }

  const type = searchTypeForPath(pathname);
  return (
    <NavbarSearchFor key={`${pathname}:${type}`} layout={layout} type={type} />
  );
}

/** On `/search` the type is the page's own `type` parameter. */
function SearchPageNavbarSearch({ layout }: { layout: Layout }) {
  const type: SearchType =
    useSearchParams().get("type") === "movie" ? "movie" : "tv";
  return (
    <NavbarSearchFor key={`/search:${type}`} layout={layout} type={type} />
  );
}

function NavbarSearchFor({
  layout,
  type,
}: {
  layout: Layout;
  type: SearchType;
}) {
  if (layout === "mobile") return <MobileSearchOverlay type={type} />;
  return <QuickSearch type={type} className="w-[22.5rem]" />;
}

/**
 * The prerendered stand in: the same field or icon at the same size, inert
 * until the real one mounts a moment later, so the bar never shifts. It is
 * not an input, so nothing typed into it can be lost in the swap.
 */
function NavbarSearchFallback({
  layout,
  type = "tv",
}: {
  layout: Layout;
  type?: SearchType;
}) {
  if (layout === "mobile") {
    return (
      <span
        aria-hidden="true"
        className="glass glass-rim glass-plate glass-shadow flex size-11 items-center justify-center rounded-full text-foreground"
      >
        <SearchIcon className="size-5" />
      </span>
    );
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        "glass glass-rim glass-plate glass-shadow flex h-12 w-[22.5rem] items-center gap-3 rounded-full pr-2 pl-4",
      )}
    >
      <SearchIcon className="size-4 shrink-0 text-text-secondary" />
      <span className="text-sm text-muted-foreground">
        Search {mediaNoun(type)}
      </span>
    </div>
  );
}

export { NavbarSearch, NavbarSearchFallback };
