"use client";

import { type ReactNode, useEffect } from "react";

/** The id of each list page's heading, which takes focus when a list empties. */
const LIBRARY_HEADING_ID = "library-heading";

/**
 * Set when a removal empties a page past page 1. The server answers that
 * refresh with a redirect to another page, and the page segment is keyed by
 * its search params, so the whole page remounts and the heading that held the
 * focus is replaced. The new heading reads this flag on mount and takes the
 * focus back. Module state, because nothing else survives the remount.
 */
let focusAfterRemount = false;

/**
 * Moves focus to the list page's heading (spec 0008, AC-16). `remounts` says
 * the heading is about to be replaced, so its replacement takes the focus too.
 */
function focusLibraryHeading({ remounts }: { remounts: boolean }) {
  focusAfterRemount = remounts;
  document.getElementById(LIBRARY_HEADING_ID)?.focus();
}

/** A failed removal keeps the card, so no redirect and no remount follow. */
function cancelLibraryHeadingFocus() {
  focusAfterRemount = false;
}

/**
 * The `h1` of `/watchlist` and `/watched`. It can take focus
 * (`tabIndex={-1}`), because removing the last card on a page moves focus
 * here, including after the redirect that follows emptying a later page
 * (AC-9, AC-16).
 */
function LibraryHeading({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!focusAfterRemount) return;
    focusAfterRemount = false;
    document.getElementById(LIBRARY_HEADING_ID)?.focus();
  }, []);

  return (
    <h1
      id={LIBRARY_HEADING_ID}
      tabIndex={-1}
      className="text-3xl leading-tight font-extrabold tracking-[-0.03em] text-foreground md:text-4xl"
    >
      {children}
    </h1>
  );
}

export { cancelLibraryHeadingFocus, focusLibraryHeading, LibraryHeading };
