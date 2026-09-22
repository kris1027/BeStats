import Link from "next/link";
import type * as React from "react";

import { MediaTypeTabs } from "@/components/layout/media-type-tabs";

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
 * The search field the references draw is deliberately absent: it belongs to
 * feature 11 and a non working search box would be a false affordance.
 *
 * The account control is passed in rather than rendered here (spec 0005,
 * AC-14). It is the only part of the shell that reads the session, so it lives
 * behind its own Suspense boundary in `app/layout.tsx`; rendering it inside this
 * component would make the whole navbar request scoped and pull `/shows` and
 * `/movies` out of the prerendered static shell.
 */
function Navbar({ accountSlot }: { accountSlot: React.ReactNode }) {
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

          <div className="md:hidden">{accountSlot}</div>
        </div>

        <MediaTypeTabs className="self-center md:self-auto" />

        <div className="hidden md:flex md:flex-1 md:justify-end">
          {accountSlot}
        </div>
      </div>
    </header>
  );
}

export { Navbar };
