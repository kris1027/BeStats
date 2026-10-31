"use client";

import { cn } from "cn";
import Link from "next/link";

import {
  defaultLibraryTypeAt,
  libraryPageName,
  libraryPages,
  libraryPath,
} from "@/lib/catalog/library-list";
import {
  isLibraryPath,
  type LibraryType,
  libraryHref,
} from "@/lib/catalog/media-type";

import { WithLibraryTypedPage } from "./page-media-type";

/**
 * The signed in library links: the pill in the desktop navbar and the list in
 * the mobile menu sheet (spec 0008, AC-14, AC-15).
 *
 * As with `MediaTypeTabs`, the lit link comes from the pathname, never client
 * state, and `aria-current="page"` carries it to assistive technology.
 * Reading the URL is the only reason this is a Client Component. It renders only
 * inside `AccountSlot`, which is already request scoped behind its own
 * Suspense boundary, so it costs no route its static shell.
 *
 * Upcoming sits between the two (spec 0014, AC-1). Each link is named for
 * the tab, through `libraryPageName`: Up next, Upcoming and Watched on shows,
 * Watchlist, Coming soon and Watched on movies, and four on games, Coming
 * soon, Want to play, Playing and Finished, in the order `libraryPages`
 * gives (prompts/library-page-names.md, prompts/game-coming-soon.md).
 *
 * Each link carries the media type of the page being viewed, so the navbar
 * tab chosen on `/movies` is still lit on its library pages (feature 22), and on a
 * games tab they carry `type=game`, so moving between its pages keeps
 * you on games (spec 0027, AC-4). Each link goes to its page's own route on
 * the tab, `/want-to-play` for Want to play (prompts/library-page-urls.md).
 * The type is read through `WithLibraryTypedPage`; the fallback links to the
 * route's default tab, so `/playing` never flashes shows links. On a
 * page about neither catalog it renders nothing, like the media tabs and the
 * search (prompts/hide-tabs-without-type.md).
 *
 * @param variant `bar` is the glass pill in the desktop navbar, 40px tall like
 * every navbar control, with `hit-area-tab` widening each link to a 44px tap
 * target like the media tabs (the 4px pill gap keeps neighbours from
 * overlapping); `sheet` is the stacked list inside the mobile menu,
 * with 44px rows for touch.
 */
type Variant = "bar" | "sheet";

function LibraryNav({ variant }: { variant: Variant }) {
  return (
    <WithLibraryTypedPage
      fallback={(pathname) => (
        <LibraryNavView
          variant={variant}
          pathname={pathname}
          type={isLibraryPath(pathname) ? defaultLibraryTypeAt(pathname) : "tv"}
        />
      )}
    >
      {({ pathname, libraryType }) => (
        <LibraryNavView
          variant={variant}
          pathname={pathname}
          type={libraryType}
        />
      )}
    </WithLibraryTypedPage>
  );
}

/** The links for a known page and type, also rendered by `/showcase`. */
function LibraryNavView({
  variant,
  pathname,
  type,
}: {
  variant: Variant;
  pathname: string;
  type: LibraryType;
}) {
  return (
    <nav
      aria-label="Library"
      className={
        variant === "bar"
          ? "glass glass-rim glass-plate glass-shadow flex items-center gap-1 rounded-full p-[4.5px]"
          : "flex flex-col gap-1"
      }
    >
      {libraryPages(type).map((list) => {
        const path = libraryPath(list, type);
        const selected = pathname === path || pathname.startsWith(`${path}/`);

        return (
          <Link
            key={path}
            href={libraryHref(list, type)}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "flex items-center rounded-full font-bold transition-[filter,color]",
              variant === "bar"
                ? "hit-area-tab h-7 px-4 text-sm"
                : "h-11 px-4 text-base",
              selected
                ? "glass-selected-personal glass-rim text-text-on-personal"
                : "text-text-link hover:text-foreground",
            )}
          >
            {libraryPageName(list, type)}
          </Link>
        );
      })}
    </nav>
  );
}

export { LibraryNav, LibraryNavView };
