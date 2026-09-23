"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The SHOWS and MOVIES control from every navbar artboard (spec 0004, AC-14).
 *
 * These are links, not toggles. Selection comes from the current pathname, so
 * a deep link, a browser back button and a server render all agree on which
 * tab is lit; client state would let them disagree. `aria-current="page"`
 * carries that same fact to assistive technology, which the glass gradient on
 * its own cannot.
 *
 * `usePathname` is the only reason this is a Client Component. It reads no
 * server dynamic API, so the shell around it stays in the static shell under
 * `cacheComponents` and the routes still prerender (AC-18).
 *
 * On a route with a dynamic param (`/movies/[id]`, spec 0006) the pathname is
 * not known at prerender time, so `usePathname` suspends there. `Navbar` wraps
 * this in a Suspense boundary whose fallback is `MediaTypeTabsView` with no
 * pathname: the same control, nothing lit, at the same footprint.
 */
const TABS = [
  { href: "/shows", label: "SHOWS" },
  { href: "/movies", label: "MOVIES" },
] as const;

function MediaTypeTabs({ className }: { className?: string }) {
  return <MediaTypeTabsView pathname={usePathname()} className={className} />;
}

/**
 * The tabs for a known pathname, or with no tab lit when `pathname` is null,
 * which is the prerendered fallback on a dynamic route.
 */
function MediaTypeTabsView({
  pathname,
  className,
}: {
  pathname: string | null;
  className?: string;
}) {
  return (
    <nav
      aria-label="Media type"
      className={cn(
        "glass glass-rim glass-plate glass-shadow flex items-center gap-1 rounded-full p-1.5",
        className,
      )}
    >
      {TABS.map((tab) => {
        const selected =
          pathname !== null &&
          (pathname === tab.href || pathname.startsWith(`${tab.href}/`));

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "flex h-9 items-center rounded-full px-5 text-xs font-semibold tracking-[0.07em] transition-[filter,color]",
              selected
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
