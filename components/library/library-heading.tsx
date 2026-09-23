"use client";

import { type ReactNode, useEffect } from "react";

/** The id of each list page's heading, which takes focus when a list empties. */
const LIBRARY_HEADING_ID = "library-heading";

/**
 * The movie whose removal looked like it emptied a page past page 1. The
 * server answers that refresh with a redirect to another page, and the page
 * segment is keyed by its search params, so the whole page remounts and the
 * heading that held the focus is replaced. The new heading reads this on
 * mount and takes the focus back. Module state, because nothing else survives
 * the remount.
 *
 * It is keyed by movie, because only the removal that set it knows whether
 * the redirect happened: when it did not, the grid is still mounted and
 * cancels it, so a later, unrelated visit never has its focus taken.
 */
let focusAfterRemountFor: number | null = null;

/**
 * Moves focus to the list page's heading (spec 0008, AC-16). `remountFor` is
 * the removed movie when the heading may be about to be replaced, so its
 * replacement takes the focus too.
 */
function focusLibraryHeading({ remountFor }: { remountFor: number | null }) {
  focusAfterRemountFor = remountFor;
  document.getElementById(LIBRARY_HEADING_ID)?.focus();
}

/**
 * The removal of `movieId` settled without a remount: it failed and the card
 * stays, or the refreshed page still had movies from later pages. Leaves
 * another removal's pending focus alone.
 */
function cancelLibraryHeadingFocus(movieId: number) {
  if (focusAfterRemountFor === movieId) focusAfterRemountFor = null;
}

/**
 * The `h1` of `/watchlist` and `/watched`. It can take focus
 * (`tabIndex={-1}`), because removing the last card on a page moves focus
 * here, including after the redirect that follows emptying a later page
 * (AC-9, AC-16).
 */
function LibraryHeading({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (focusAfterRemountFor === null) return;
    focusAfterRemountFor = null;
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
