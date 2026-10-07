"use client";

import { cn } from "cn";
import Link from "next/link";

import { type MediaType, typedHref } from "@/lib/catalog/media-type";

import { WithPageMediaType } from "./page-media-type";

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
 * Upcoming sits between the two (spec 0014, AC-1).
 *
 * Each link carries the media type of the page being viewed, so the navbar
 * tab chosen on `/movies` is still lit on `/watchlist` (feature 22), read
 * through `WithPageMediaType`; the fallback links to the default type.
 *
 * @param variant `bar` is the glass pill in the desktop navbar, 40px tall like
 * every navbar control, with `hit-area-tab` widening each link to a 44px tap
 * target like the media tabs (the 4px pill gap keeps neighbours from
 * overlapping); `sheet` is the stacked list inside the mobile menu,
 * with 44px rows for touch.
 */
const LINKS = [
  { path: "/watchlist", label: "Watchlist" },
  { path: "/upcoming", label: "Upcoming" },
  { path: "/watched", label: "Watched" },
] as const;

type Variant = "bar" | "sheet";

function LibraryNav({ variant }: { variant: Variant }) {
  return (
    <WithPageMediaType
      fallback={(pathname) => (
        <LibraryNavView variant={variant} pathname={pathname} type="tv" />
      )}
    >
      {({ pathname, type }) => (
        <LibraryNavView
          variant={variant}
          pathname={pathname}
          type={type ?? "tv"}
        />
      )}
    </WithPageMediaType>
  );
}

function LibraryNavView({
  variant,
  pathname,
  type,
}: {
  variant: Variant;
  pathname: string;
  type: MediaType;
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
      {LINKS.map((link) => {
        const selected =
          pathname === link.path || pathname.startsWith(`${link.path}/`);

        return (
          <Link
            key={link.path}
            href={typedHref(link.path, type)}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "flex items-center rounded-full font-bold transition-[filter,color]",
              variant === "bar"
                ? "hit-area-tab h-7 px-4 text-sm"
                : "h-11 px-4 text-base",
              selected
                ? "glass-selected glass-rim text-foreground"
                : "text-text-link hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export { LibraryNav };
