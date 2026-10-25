"use client";

import { cn } from "cn";
import Link from "next/link";

import {
  CATALOG_PATHS,
  isLibraryPath,
  type LibraryType,
  type MediaType,
  type TypedPath,
  typedHref,
} from "@/lib/catalog/media-type";
import { gamesLibraryEnabled } from "@/lib/env";

import { WithLibraryTypedPage } from "./page-media-type";

/**
 * The SHOWS and MOVIES control in the navbar (spec 0004, AC-14; feature 22),
 * with GAMES beside them on the library pages while the games library is on
 * (spec 0027, AC-3).
 *
 * These are links, not toggles. Selection comes from the URL, so a deep link,
 * a browser back button and a server render all agree on which tab is lit;
 * client state would let them disagree. `aria-current="page"` carries that
 * same fact to assistive technology, which the glass gradient on its own
 * cannot.
 *
 * On `/watchlist`, `/upcoming`, `/watched` and `/search` the tabs switch the
 * page's own `type` parameter in place; everywhere else they lead to `/shows`
 * and `/movies`. `WithLibraryTypedPage` reads the page's type, and on those
 * four pages the current query, which `/search` keeps across a switch.
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
 * Each tab's link on a typed page: the same page with its own `type`, and a
 * GAMES link only on a library page while the games library is on.
 */
function typedHrefs(pathname: TypedPath, current?: URLSearchParams): TabHrefs {
  const hrefs = {
    tv: typedHref(pathname, "tv", { current }),
    movie: typedHref(pathname, "movie", { current }),
  };
  if (!isLibraryPath(pathname) || !gamesLibraryEnabled()) return hrefs;
  return { ...hrefs, game: typedHref(pathname, "game") };
}

/** Where each tab leads; a GAMES tab renders only when it has a link. */
type TabHrefs = Record<MediaType, string> & { game?: string };

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
 * @param hrefs Where each tab leads, `/shows` and `/movies` by default. The
 * GAMES tab renders only when `hrefs` gives it a link.
 */
function MediaTypeTabsView({
  selected,
  hrefs = { tv: CATALOG_PATHS.tv, movie: CATALOG_PATHS.movie },
  className,
}: {
  selected: LibraryType | null;
  hrefs?: TabHrefs;
  className?: string;
}) {
  const tabs = TABS.flatMap((tab) => {
    const href = hrefs[tab.type];
    return href === undefined ? [] : [{ ...tab, href }];
  });

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
