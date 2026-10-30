"use client";

import { cn } from "cn";
import { useEffect } from "react";

import { WithPageMediaType } from "@/components/layout/page-media-type";
import { SKELETON_SURFACE } from "@/components/skeleton";
import {
  defaultLibraryType,
  type LibraryPageKey,
  libraryPageName,
} from "@/lib/catalog/library-list";

import { LIBRARY_HEADING_ID } from "./ids";

/**
 * The card whose removal looked like it emptied a page past page 1. The
 * server answers that refresh with a redirect to another page, and the page
 * segment is keyed by its search params, so the whole page remounts and the
 * heading that held the focus is replaced. The new heading reads this on
 * mount and takes the focus back. Module state, because nothing else survives
 * the remount.
 *
 * It is keyed by card (`libraryItemKey`, since a movie and a show can share
 * a TMDB id), because only the removal that set it knows whether the redirect
 * happened: when it did not, the grid is still mounted and cancels it, so a
 * later, unrelated visit never has its focus taken.
 */
let focusAfterRemountFor: string | null = null;

/**
 * Moves focus to the list page's heading (spec 0008, AC-16). `remountFor` is
 * the removed card when the heading may be about to be replaced, so its
 * replacement takes the focus too.
 */
function focusLibraryHeading({ remountFor }: { remountFor: string | null }) {
  focusAfterRemountFor = remountFor;
  document.getElementById(LIBRARY_HEADING_ID)?.focus();
}

/**
 * The removal of the card `key` settled without a remount: it failed and the
 * card stays, or the refreshed page still had titles from later pages. Leaves
 * another removal's pending focus alone.
 */
function cancelLibraryHeadingFocus(key: string) {
  if (focusAfterRemountFor === key) focusAfterRemountFor = null;
}

/**
 * The `h1` of `/watchlist`, `/upcoming`, `/watched` and `/coming-soon`. It
 * can take focus (`tabIndex={-1}`), because removing the last card on a page
 * moves focus here, including after the redirect that follows emptying a
 * later page (AC-9, AC-16).
 *
 * The element is in the static shell, so the focus target always exists, but
 * its text is the page's name on the current tab (`libraryPageName`), which
 * needs the `type` parameter: it streams in through `WithPageMediaType`, with
 * a placeholder bar until then, so no other tab's name flashes. A bad `type`
 * reads as the page's default tab, the tab its panel leads back to
 * (prompts/library-page-names.md, prompts/game-coming-soon.md).
 */
function LibraryHeading({ list }: { list: LibraryPageKey }) {
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
      <WithPageMediaType fallback={() => <HeadingPlaceholder />}>
        {({ libraryType }) =>
          libraryPageName(list, libraryType ?? defaultLibraryType(list))
        }
      </WithPageMediaType>
    </h1>
  );
}

/**
 * The heading's stand in, one line tall like the name it replaces. A span,
 * because an `h1` holds only phrasing content, so it wears `Skeleton`'s
 * surface rather than being one.
 */
function HeadingPlaceholder() {
  return (
    <span
      aria-hidden="true"
      className={cn(
        SKELETON_SURFACE,
        "inline-block h-[0.8em] w-48 rounded-sm align-middle",
      )}
    />
  );
}

export { cancelLibraryHeadingFocus, focusLibraryHeading, LibraryHeading };
