"use client";

import { cn } from "cn";
import Link from "next/link";

import {
  CATALOG_PATHS,
  type MediaType,
  typedHref,
} from "@/lib/catalog/media-type";

import { WithPageMediaType } from "./page-media-type";

/**
 * The SHOWS and MOVIES control in the navbar (spec 0004, AC-14; feature 22).
 *
 * These are links, not toggles. Selection comes from the URL, so a deep link,
 * a browser back button and a server render all agree on which tab is lit;
 * client state would let them disagree. `aria-current="page"` carries that
 * same fact to assistive technology, which the glass gradient on its own
 * cannot.
 *
 * On `/watchlist`, `/upcoming`, `/watched` and `/search` the tabs switch the
 * page's own `type` parameter in place; everywhere else they lead to `/shows`
 * and `/movies`. `WithPageMediaType` reads the page's type, and on those four
 * pages the current query, which `/search` keeps across a switch.
 *
 * On a route with a dynamic param (`/movies/[id]`, spec 0006) the pathname is
 * not known at prerender time, so `usePathname` suspends there. `Navbar` wraps
 * this in a Suspense boundary whose fallback is `MediaTypeTabsView` with
 * nothing lit: the same control at the same footprint.
 */
function MediaTypeTabs({ className }: { className?: string }) {
  return (
    <WithPageMediaType
      fallback={(pathname) => (
        <MediaTypeTabsView
          selected={null}
          hrefs={{
            tv: typedHref(pathname, "tv"),
            movie: typedHref(pathname, "movie"),
          }}
          className={className}
        />
      )}
    >
      {(page) => (
        // On a typed page the lit tab is its `type`, and each tab rewrites it.
        <MediaTypeTabsView
          selected={page.type}
          hrefs={
            page.params === null
              ? undefined
              : {
                  tv: typedHref(page.pathname, "tv", { current: page.params }),
                  movie: typedHref(page.pathname, "movie", {
                    current: page.params,
                  }),
                }
          }
          className={className}
        />
      )}
    </WithPageMediaType>
  );
}

/**
 * The tabs for a known selection, or with no tab lit when `selected` is null:
 * the prerendered fallback, and any page that is about neither catalog.
 *
 * @param hrefs Where each tab leads, `/shows` and `/movies` by default.
 */
function MediaTypeTabsView({
  selected,
  hrefs = CATALOG_PATHS,
  className,
}: {
  selected: MediaType | null;
  hrefs?: Record<MediaType, string>;
  className?: string;
}) {
  const tabs = [
    { type: "tv", label: "SHOWS" },
    { type: "movie", label: "MOVIES" },
  ] as const;

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
            href={hrefs[tab.type]}
            aria-current={isSelected ? "page" : undefined}
            className={cn(
              "hit-area-tab flex h-7 items-center rounded-full px-4 text-xs font-semibold tracking-[0.07em] transition-[filter,color]",
              isSelected
                ? "glass-selected glass-rim text-foreground"
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
