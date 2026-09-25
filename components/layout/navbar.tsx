import Link from "next/link";
import type * as React from "react";
import { Suspense } from "react";

import {
  MediaTypeTabs,
  MediaTypeTabsView,
} from "@/components/layout/media-type-tabs";
import {
  NavbarSearch,
  NavbarSearchFallback,
} from "@/components/search/navbar-search";

/**
 * The sticky top navigation, in its signed out form (spec 0004, AC-13).
 *
 * Two layouts that swap at `md`, taken from the two navbar artboards: one row
 * on desktop with the brand, the tabs and Sign in, and two rows on mobile with
 * the brand and Sign in above a centred tab control. They are rendered as one
 * tree with responsive classes rather than two components, so the tab control
 * keeps a single tab stop and a single DOM node at every width.
 *
 * Backdrop blur at 16px, because this is a surface that content scrolls
 * underneath (AC-16). `scroll-padding-top` on the root layout keeps an
 * anchored heading from landing behind it.
 *
 * The search sits between the tabs and the account controls on desktop, and
 * as a round icon beside the account control on mobile (spec 0010, AC-1,
 * AC-6). Each reads the pathname, so each has its own Suspense boundary whose
 * fallback is the same control at the same size, for the same reason as the
 * tabs.
 *
 * The account controls are passed in rather than rendered here (spec 0005,
 * AC-14). They are the only part of the shell that reads the session, so each
 * lives behind its own Suspense boundary in `app/layout.tsx`; rendering them
 * inside this component would make the whole navbar request scoped and pull
 * `/shows` and `/movies` out of the prerendered static shell.
 *
 * There are two slots, one per layout, because signed in they hold different
 * things (spec 0008, AC-14, AC-15): the desktop row carries the library links,
 * the account button and Sign out, while the mobile bar carries the avatar and
 * the menu button whose sheet holds the rest. Each is hidden by CSS at the
 * other breakpoint.
 */
function Navbar({
  mobileAccountSlot,
  desktopAccountSlot,
}: {
  mobileAccountSlot: React.ReactNode;
  desktopAccountSlot: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-background/70 backdrop-blur-glass">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-6 md:py-2.5">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/shows"
            className="rounded-sm text-xl leading-none font-extrabold tracking-[-0.03em] text-foreground"
          >
            BeStats
          </Link>

          <div className="flex items-center gap-2 md:hidden">
            <Suspense fallback={<NavbarSearchFallback layout="mobile" />}>
              <NavbarSearch layout="mobile" />
            </Suspense>
            {mobileAccountSlot}
          </div>
        </div>

        {/*
         * The boundary only ever suspends on a route with a dynamic param,
         * where the pathname is unknown at prerender time (spec 0006, AC-11).
         * Its fallback is the same control with nothing lit, so the shell
         * keeps the tabs and the bar does not change size.
         */}
        <Suspense
          fallback={
            <MediaTypeTabsView
              pathname={null}
              className="self-center md:self-auto"
            />
          }
        >
          <MediaTypeTabs className="self-center md:self-auto" />
        </Suspense>

        <div className="hidden md:block">
          <Suspense fallback={<NavbarSearchFallback layout="desktop" />}>
            <NavbarSearch layout="desktop" />
          </Suspense>
        </div>

        <div className="hidden md:flex md:flex-1 md:justify-end">
          {desktopAccountSlot}
        </div>
      </div>
    </header>
  );
}

export { Navbar };
