import Link from "next/link";

import { MediaTypeTabs } from "@/components/layout/media-type-tabs";
import { ButtonLink } from "@/components/ui/button";

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
 * Two things the references draw are deliberately absent. The search field
 * belongs to feature 11 and a non working search box would be a false
 * affordance, so its slot is left out rather than faked. The signed in form,
 * with the account initial and the menu, belongs to feature 6; the menu sheet
 * primitive it will use already ships in `mobile-menu-sheet.tsx`.
 */
function Navbar() {
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

          <ButtonLink size="touch" href="/sign-in" className="md:hidden">
            Sign in
          </ButtonLink>
        </div>

        <MediaTypeTabs className="self-center md:self-auto" />

        <div className="hidden md:flex md:flex-1 md:justify-end">
          <ButtonLink size="sm" href="/sign-in">
            Sign in
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}

export { Navbar };
