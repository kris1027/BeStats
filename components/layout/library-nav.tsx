"use client";

import { cn } from "cn";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import type * as React from "react";

import {
  CalendarIcon,
  NextEpisodeIcon,
  PlanIcon,
  WatchedIcon,
} from "@/components/tracking/tracking-icons";

import {
  defaultLibraryTypeAt,
  type LibraryPageKey,
  libraryPageName,
  libraryPages,
  libraryPath,
} from "@/lib/catalog/library-list";
import {
  isLibraryPath,
  type LibraryType,
  libraryHref,
} from "@/lib/catalog/media-type";

import { NAV_PILL_CLASS } from "./media-type-tabs";
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
 * overlapping); `sheet` is the glass panel of rows inside the mobile menu,
 * each 56px with the page's mark, its name and a chevron
 * (prompts/mobile-navigation.md).
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

/** One of the card marks a menu row can wear. */
type PageMark = "date" | "plan" | "next" | "done";

/**
 * Each page's mark in the mobile menu, the card marks' own icons, so a mark
 * means one thing everywhere (`layout/icon-key.tsx`): the release date for
 * the pages that wait on one, Plan for the lists you mean to start, the next
 * episode for what you are in the middle of, and Watched for what is done.
 * Laid out like `LIBRARY_PAGE_NAMES` in `lib/catalog/library-list.ts`, so a
 * page added to one tab is added here in the same shape.
 */
const PAGE_MARKS = {
  watchlist: { tv: "next", movie: "plan", game: "plan" },
  upcoming: { tv: "date", movie: "date", game: "next" },
  watched: { tv: "done", movie: "done", game: "done" },
  "coming-soon": { game: "date" },
} as const satisfies Record<
  LibraryPageKey,
  Partial<Record<LibraryType, PageMark>>
>;

const MARK_ICONS: Record<PageMark, React.ReactNode> = {
  date: <CalendarIcon className="size-[18px]" />,
  plan: <PlanIcon className="size-[18px]" />,
  next: <NextEpisodeIcon className="size-[18px]" />,
  done: <WatchedIcon filled className="size-[18px]" />,
};

function pageIcon(page: LibraryPageKey, type: LibraryType): React.ReactNode {
  const marks: Partial<Record<LibraryType, PageMark>> = PAGE_MARKS[page];
  return MARK_ICONS[marks[type] ?? "date"];
}

/**
 * The links for a known page and type, also rendered by `/showcase`. The
 * mobile menu previews another tab's links, so it passes a `pathname` of
 * null there, and nothing is lit: `/watched` on shows is not the movies
 * Watched page.
 */
function LibraryNavView({
  variant,
  pathname,
  type,
}: {
  variant: Variant;
  pathname: string | null;
  type: LibraryType;
}) {
  if (variant === "sheet") {
    return (
      <nav
        aria-label="Library"
        className="glass glass-rim flex flex-col gap-0.5 rounded-panel p-1.5"
      >
        {libraryPages(type).map((page) => {
          const path = libraryPath(page, type);
          const selected = isCurrent(pathname, path);

          return (
            <Link
              key={path}
              href={libraryHref(page, type)}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "flex h-14 items-center gap-3.5 rounded-[18px] px-2.5 text-[17px] tracking-[-0.01em] transition-[filter,color]",
                selected
                  ? "glass-selected-personal glass-rim font-bold text-text-on-personal"
                  : "font-semibold text-foreground hover:text-text-link",
              )}
            >
              {/*
               * The marks draw in the light tokens they wear on the cards,
               * so the lit row's tile goes dark rather than recolouring them.
               */}
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-xl",
                  selected ? "bg-text-on-personal/85" : "bg-foreground/10",
                )}
              >
                {pageIcon(page, type)}
              </span>
              <span className="flex-1">{libraryPageName(page, type)}</span>
              <ChevronRightIcon
                className="size-4 opacity-50"
                aria-hidden="true"
              />
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="Library" className={NAV_PILL_CLASS}>
      {libraryPages(type).map((list) => {
        const path = libraryPath(list, type);
        const selected = isCurrent(pathname, path);

        return (
          <Link
            key={path}
            href={libraryHref(list, type)}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "hit-area-tab flex h-7 shrink-0 items-center rounded-full px-4 text-sm font-bold whitespace-nowrap transition-[filter,color]",
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

function isCurrent(pathname: string | null, path: string): boolean {
  return (
    pathname !== null && (pathname === path || pathname.startsWith(`${path}/`))
  );
}

export { LibraryNav, LibraryNavView };
