"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { UPCOMING_PATH } from "@/components/upcoming/ids";

/**
 * The signed in library links: `library-navigation` in
 * `design/desktop-navbar-signed-in.svg` and the links in
 * `design/mobile-menu-open.svg` (spec 0008, AC-14, AC-15).
 *
 * As with `MediaTypeTabs`, the lit link comes from the pathname, never client
 * state, and `aria-current="page"` carries it to assistive technology.
 * `usePathname` is the only reason this is a Client Component. It renders only
 * inside `AccountSlot`, which is already request scoped behind its own
 * Suspense boundary, so it costs no route its static shell.
 *
 * Upcoming sits between the two, as both artboards draw it (spec 0014, AC-1).
 *
 * @param variant `bar` is the glass pill in the desktop navbar; `sheet` is the
 * stacked list inside the mobile menu, with 44px rows for touch.
 */
const LINKS = [
  { href: "/watchlist", label: "Watchlist" },
  { href: UPCOMING_PATH, label: "Upcoming" },
  { href: "/watched", label: "Watched" },
] as const;

function LibraryNav({ variant }: { variant: "bar" | "sheet" }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Library"
      className={
        variant === "bar"
          ? "glass glass-rim glass-plate glass-shadow flex items-center gap-1 rounded-full p-1.5"
          : "flex flex-col gap-1"
      }
    >
      {LINKS.map((link) => {
        const selected =
          pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "flex items-center rounded-full font-bold transition-[filter,color]",
              variant === "bar" ? "h-9 px-5 text-sm" : "h-11 px-4 text-base",
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
