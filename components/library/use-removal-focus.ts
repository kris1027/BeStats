import { type RefObject, useEffect, useRef } from "react";

import {
  cancelLibraryHeadingFocus,
  focusLibraryHeading,
} from "./library-heading";

/**
 * Where the focus goes when a library card is removed, shared by the movie
 * grid and the game grid so a fix lands in both (spec 0008, AC-16; spec
 * 0027, AC-13).
 *
 * Focus leaves the card before it disappears: to the nearest following
 * card's name link, else the nearest preceding one's, else the heading. A
 * card with no link (a missing title, or a hidden game) takes the focus on
 * its remove button. Emptying a page past page 1 redirects, which remounts
 * the page, so the heading is asked to take the focus again after the
 * remount; when the refreshed page arrives without a redirect, or the
 * removal fails, that request is cancelled, so the new heading never takes
 * the focus on some later visit.
 *
 * @param items The server's cards; a refresh without the removed card means
 * the page did not redirect.
 * @param visible The cards on screen, with the optimistic removals applied.
 * @param itemKey The card key the grid writes to `data-item-key`.
 * @param page The page number; only a page past 1 can redirect.
 * @returns `moveFocusFrom`, called before a card is hidden, and
 * `removalFailed`, called when its removal fails and the card stays.
 */
export function useRemovalFocus<Item>({
  items,
  visible,
  itemKey,
  page,
  gridRef,
}: {
  items: readonly Item[];
  visible: readonly Item[];
  itemKey: (item: Item) => string;
  page: number;
  gridRef: RefObject<HTMLElement | null>;
}) {
  /** The removal that sent the focus to the heading expecting a remount. */
  const headingFocusFor = useRef<string | null>(null);
  useEffect(() => {
    const key = headingFocusFor.current;
    if (key === null || items.some((item) => itemKey(item) === key)) {
      return;
    }
    headingFocusFor.current = null;
    cancelLibraryHeadingFocus(key);
  }, [items, itemKey]);

  function moveFocusFrom(key: string) {
    const index = visible.findIndex((item) => itemKey(item) === key);
    const candidates = [
      ...visible.slice(index + 1),
      ...visible.slice(0, index).reverse(),
    ];

    for (const target of candidates) {
      const card = gridRef.current?.querySelector(
        `[data-item-key="${itemKey(target)}"]`,
      );
      const focusable =
        card?.querySelector<HTMLElement>("h3 a") ??
        card?.querySelector<HTMLElement>("button");
      if (focusable) {
        focusable.focus();
        return;
      }
    }

    const remountFor = page > 1 ? key : null;
    headingFocusFor.current = remountFor;
    focusLibraryHeading({ remountFor });
  }

  function removalFailed(key: string) {
    if (headingFocusFor.current === key) {
      headingFocusFor.current = null;
    }
    cancelLibraryHeadingFocus(key);
  }

  return { moveFocusFrom, removalFailed };
}
