import type * as React from "react";
import { Suspense } from "react";

import { BrandLink, BrandLinkView } from "@/components/layout/brand-link";
import {
  MediaTypeTabs,
  MediaTypeTabsView,
} from "@/components/layout/media-type-tabs";
import {
  NavbarSearch,
  NavbarSearchFallback,
} from "@/components/search/navbar-search";

/**
 * The top navigation, in its signed out form (spec 0004, AC-13).
 *
 * Two layouts that swap at `md`, both one row: on desktop the brand, the
 * tabs, the search and the account controls; on mobile only the brand and
 * the menu button, whose full screen sheet holds the rest
 * (prompts/mobile-navigation.md). They are rendered as one tree with
 * responsive classes rather than two components, so the tab control keeps a
 * single DOM node, hidden below `md`.
 *
 * Transparent and not sticky: no background, border or blur, and it scrolls
 * away with the page. A transparent bar pinned over scrolling content left the
 * wordmark and the gaps between pills unreadable, so it sits at the top of the
 * document instead and never overlaps anything. Every control is 40px tall at
 * every width, with `hit-area` restoring a 44px tap target on mobile
 * (AGENTS.md section 3).
 *
 * The search sits between the tabs and the account controls on desktop
 * (spec 0010, AC-1); on mobile it is in the menu (AC-6). It reads the
 * pathname, so it has its own Suspense boundary whose fallback is the same
 * field at the same size, for the same reason as the tabs.
 *
 * The account controls are passed in rather than rendered here (spec 0005,
 * AC-14). They are the only part of the shell that reads the session, so each
 * lives behind its own Suspense boundary in `app/layout.tsx`; rendering them
 * inside this component would make the whole navbar request scoped and pull
 * `/shows` and `/movies` out of the prerendered static shell.
 *
 * There are two slots, one per layout, because signed in they hold different
 * things (spec 0008, AC-14, AC-15): the desktop row carries the library links,
 * the account button and Sign out, while the mobile bar carries only the menu
 * button. Each is hidden by CSS at the other breakpoint.
 */
function Navbar({
  mobileAccountSlot,
  desktopAccountSlot,
}: {
  mobileAccountSlot: React.ReactNode;
  desktopAccountSlot: React.ReactNode;
}) {
  return (
    <header className="relative z-20 w-full">
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-2 md:justify-start md:gap-6">
        {/*
         * The logo links to the page's catalog (prompts/
         * logo-follows-media-type.md), so it reads the pathname and needs
         * the same boundary as the tabs on a dynamic route.
         */}
        <Suspense fallback={<BrandLinkView type="tv" />}>
          <BrandLink />
        </Suspense>

        <div className="md:hidden">{mobileAccountSlot}</div>

        {/*
         * The boundary only ever suspends on a route with a dynamic param,
         * where the pathname is unknown at prerender time (spec 0006, AC-11).
         * Its fallback is the same control with nothing lit, so the shell
         * keeps the tabs and the bar does not change size. `not-empty` keeps
         * the wrapper out of the row on a page with no tabs.
         */}
        <div className="hidden md:not-empty:flex">
          <Suspense fallback={<MediaTypeTabsView selected={null} />}>
            <MediaTypeTabs />
          </Suspense>
        </div>

        {/*
         * `not-empty` keeps the wrapper out of the row when the search renders
         * nothing (a page with no type), so it leaves no extra flex gap
         * (prompts/hide-tabs-without-type.md, decision 3). The field has a
         * width per breakpoint rather than taking what the row leaves, so the
         * account slot streaming in beside it never resizes it: 240px where
         * the row is tight (`md`, and from `xl` where the signed in row
         * returns) and 360px where it has room. It may still shrink to 160px
         * rather than overflow (prompts/mobile-navigation.md, decisions 10
         * and 11).
         */}
        <div className="hidden min-w-40 md:not-empty:block md:w-60 lg:w-[22.5rem] xl:w-60 min-[87.5rem]:w-[22.5rem]">
          <Suspense fallback={<NavbarSearchFallback />}>
            <NavbarSearch />
          </Suspense>
        </div>

        <div className="hidden md:ml-auto md:flex md:justify-end xl:flex-1">
          {desktopAccountSlot}
        </div>
      </div>
    </header>
  );
}

export { Navbar };
