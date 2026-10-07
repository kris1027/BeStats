"use client";

import { cn } from "cn";
import { SearchIcon } from "lucide-react";

import { WithPageMediaType } from "@/components/layout/page-media-type";
import type { MediaType } from "@/lib/catalog/media-type";
import { mediaNoun } from "@/lib/search/count";

import { MobileSearchOverlay } from "./mobile-search-overlay";
import { QuickSearch } from "./quick-search";

type Layout = "desktop" | "mobile";

/**
 * The navbar's search, the desktop field or the mobile icon (spec 0010, AC-1,
 * AC-6).
 *
 * The type follows the page (feature 22): movies under `/movies`, shows
 * under `/shows`, the `type` parameter on `/watchlist`, `/upcoming`,
 * `/watched` and `/search`, and shows everywhere else, read through
 * `WithPageMediaType`. `usePathname` suspends on a route with a dynamic param
 * at prerender time, so `Navbar` wraps this in Suspense with
 * `NavbarSearchFallback`.
 *
 * The field is keyed on the pathname and type, so it starts empty on every
 * page (AC-17).
 */
function NavbarSearch({ layout }: { layout: Layout }) {
  return (
    <WithPageMediaType
      fallback={() => <NavbarSearchFallback layout={layout} type="tv" />}
    >
      {({ pathname, type }) => (
        <NavbarSearchFor
          key={`${pathname}:${type ?? "tv"}`}
          layout={layout}
          type={type ?? "tv"}
        />
      )}
    </WithPageMediaType>
  );
}

function NavbarSearchFor({
  layout,
  type,
}: {
  layout: Layout;
  type: MediaType;
}) {
  if (layout === "mobile") return <MobileSearchOverlay type={type} />;
  return <QuickSearch type={type} className="h-10 w-[22.5rem]" />;
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
  type?: MediaType;
}) {
  if (layout === "mobile") {
    return (
      <span
        aria-hidden="true"
        className="glass glass-rim glass-plate glass-shadow flex size-10 items-center justify-center rounded-full text-foreground"
      >
        <SearchIcon className="size-5" />
      </span>
    );
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        "glass glass-rim glass-plate glass-shadow flex h-10 w-[22.5rem] items-center gap-3 rounded-full pr-2 pl-4",
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
