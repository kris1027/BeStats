"use client";

import { SearchIcon } from "lucide-react";

import { WithLibraryTypedPage } from "@/components/layout/page-media-type";
import type { LibraryType } from "@/lib/catalog/media-type";
import { mediaNoun } from "@/lib/search/count";

import { QuickSearch } from "./quick-search";

/**
 * The desktop navbar's search field (spec 0010, AC-1). On mobile the search
 * lives in the menu sheet, `MobileMenuSheet` (AC-6,
 * prompts/mobile-navigation.md).
 *
 * The type follows the page (feature 22): movies under `/movies`, shows
 * under `/shows`, games under `/games`, and the
 * `type` parameter on `/watchlist`, `/upcoming`, `/watched` and `/search`,
 * read through `WithLibraryTypedPage`, the field the tabs follow (spec 0029,
 * AC-15). A page about neither catalog renders no search at all
 * (prompts/hide-tabs-without-type.md). `usePathname` suspends on a route
 * with a dynamic param at prerender time, so `Navbar` wraps this in Suspense
 * with `NavbarSearchFallback`, which reads `Search shows` until the type is
 * known: `/games/{id}` and the typed pages show it once, the flash spec 0027,
 * AC-4 accepted. `/games` and its list pages are static, so their shell has
 * `Search games` at once.
 *
 * The field is keyed on the pathname and type, so it starts empty on every
 * page (AC-17).
 */
function NavbarSearch() {
  return (
    <WithLibraryTypedPage fallback={() => <NavbarSearchFallback />}>
      {({ pathname, libraryType }) => (
        <QuickSearch
          key={`${pathname}:${libraryType}`}
          type={libraryType}
          className="h-10 w-[22.5rem]"
        />
      )}
    </WithLibraryTypedPage>
  );
}

/**
 * The prerendered stand in: the same field at the same size, inert
 * until the real one mounts a moment later, so the bar never shifts. It is
 * not an input, so nothing typed into it can be lost in the swap.
 */
function NavbarSearchFallback({ type = "tv" }: { type?: LibraryType }) {
  return (
    <div
      aria-hidden="true"
      className="glass glass-rim glass-plate glass-shadow flex h-10 w-[22.5rem] items-center gap-3 rounded-full pr-2 pl-4"
    >
      <SearchIcon className="size-4 shrink-0 text-text-secondary" />
      <span className="text-sm text-muted-foreground">
        Search {mediaNoun(type)}
      </span>
    </div>
  );
}

export { NavbarSearch, NavbarSearchFallback };
