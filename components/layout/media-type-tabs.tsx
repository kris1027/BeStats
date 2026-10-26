"use client";

import { cn } from "cn";
import Link from "next/link";

import {
  CATALOG_PATHS,
  type LibraryType,
  type TypedPath,
  typedHref,
} from "@/lib/catalog/media-type";

import { WithLibraryTypedPage } from "./page-media-type";

/**
 * The SHOWS and MOVIES control in the navbar (spec 0004, AC-14; feature 22),
 * with GAMES beside them on every page (spec 0027, AC-3; spec 0028, AC-14;
 * spec 0032, AC-12).
 *
 * These are links, not toggles. Selection comes from the URL, so a deep link,
 * a browser back button and a server render all agree on which tab is lit;
 * client state would let them disagree. `aria-current="page"` carries that
 * same fact to assistive technology, which the glass gradient on its own
 * cannot.
 *
 * On `/watchlist`, `/upcoming`, `/watched` and `/search` the tabs switch the
 * page's own `type` parameter in place, GAMES included (spec 0029, AC-14);
 * everywhere else they lead to `/shows`, `/movies` and `/games`.
 * `WithLibraryTypedPage` reads the page's type, and on those four pages the
 * current query, which `/search` keeps across a switch.
 *
 * On a page about neither catalog (`/account`, `/privacy`, the auth pages)
 * there is nothing to switch, so it renders nothing
 * (prompts/hide-tabs-without-type.md).
 *
 * On a route with a dynamic param (`/movies/[id]`, spec 0006) the pathname is
 * not known at prerender time, so `usePathname` suspends there. `Navbar` wraps
 * this in a Suspense boundary whose fallback is `MediaTypeTabsView` with
 * nothing lit: the same control at the same footprint. Its own fallback on a
 * typed page, before `?type` is known, likewise renders the tabs that page
 * will have, GAMES included, with none lit.
 */
function MediaTypeTabs({ className }: { className?: string }) {
  return (
    <WithLibraryTypedPage
      fallback={(pathname) => (
        <MediaTypeTabsView
          selected={null}
          hrefs={typedHrefs(pathname)}
          className={className}
        />
      )}
    >
      {(page) => (
        // On a typed page the lit tab is its `type`, and each tab rewrites it.
        <MediaTypeTabsView
          selected={page.libraryType}
          hrefs={
            page.params === null
              ? undefined
              : typedHrefs(page.pathname, page.params)
          }
          className={className}
        />
      )}
    </WithLibraryTypedPage>
  );
}

/**
 * Each tab's link on a typed page: the same page with its own `type`
 * (spec 0028, AC-14; spec 0029, AC-14). On `/search` each keeps the query,
 * year and rating `typedHref` allows.
 */
function typedHrefs(pathname: TypedPath, current?: URLSearchParams): TabHrefs {
  return {
    tv: typedHref(pathname, "tv", { current }),
    movie: typedHref(pathname, "movie", { current }),
    game: typedHref(pathname, "game", { current }),
  };
}

/** Each tab's link off the typed pages, the three catalog landings (spec 0028, AC-14). */
function catalogHrefs(): TabHrefs {
  return {
    tv: CATALOG_PATHS.tv,
    movie: CATALOG_PATHS.movie,
    game: CATALOG_PATHS.game,
  };
}

/** Where each tab leads. */
type TabHrefs = Record<LibraryType, string>;

const TABS = [
  { type: "tv", label: "SHOWS" },
  { type: "movie", label: "MOVIES" },
  { type: "game", label: "GAMES" },
] as const satisfies readonly { type: LibraryType; label: string }[];

/**
 * The tabs for a known selection, or with no tab lit when `selected` is null,
 * which only the prerendered fallback uses: a page about neither catalog
 * renders no tabs at all.
 *
 * @param hrefs Where each tab leads, `/shows`, `/movies` and `/games` by
 * default.
 */
function MediaTypeTabsView({
  selected,
  hrefs = catalogHrefs(),
  className,
}: {
  selected: LibraryType | null;
  hrefs?: TabHrefs;
  className?: string;
}) {
  const tabs = TABS.map((tab) => ({ ...tab, href: hrefs[tab.type] }));

  return (
    <nav
      aria-label="Media type"
      className={cn(
        "glass glass-rim glass-plate glass-shadow flex items-center gap-1 rounded-full p-[4.5px]",
        className,
      )}
    >
      {tabs.map((tab) => {
        const isSelected = selected === tab.type;

        return (
          <Link
            key={tab.type}
            href={tab.href}
            aria-current={isSelected ? "page" : undefined}
            className={cn(
              "hit-area-tab flex h-7 items-center rounded-full px-4 text-xs font-semibold tracking-[0.07em] transition-[filter,color]",
              isSelected
                ? "glass-selected-personal glass-rim text-text-on-personal"
                : "text-text-secondary hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export { MediaTypeTabs, MediaTypeTabsView };
