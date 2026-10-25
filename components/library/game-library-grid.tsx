"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useOptimistic, useRef } from "react";

import { removeGame } from "@/app/games/actions";
import { POSTER_GRID_EAGER, PosterGrid } from "@/components/poster-grid";
import {
  gameTrackingToastId,
  settleResultCall,
  showGameTrackingError,
} from "@/components/tracking/tracking-toast";
import { showGameUndo } from "@/components/tracking/use-game-undo";

import { GameLibraryCard } from "./game-library-card";
import {
  cancelLibraryHeadingFocus,
  focusLibraryHeading,
} from "./library-heading";
import { gameItemKey, type LibraryGameItem, type LibraryList } from "./types";

/**
 * The game grid on the games tabs of `/watchlist`, `/upcoming` and
 * `/watched`, and everything a removal does (spec 0027, AC-12, AC-13).
 *
 * The movie grid's order exactly (`library-grid.tsx`): a removal hides the
 * card at once through `useOptimistic`, then runs spec 0026's `removeGame`,
 * whose `refresh()` delivers the new page in the same response, so on
 * success the hidden card is simply absent from the next `items`. On failure
 * the transition ends with the card still in `items`, so it reappears in
 * place with no rollback code. Each removal is its own transition and toast,
 * so several in a row never interfere.
 *
 * Undo is not optimistic: `restoreRemovedGame` puts the row back with its
 * dates, and its `refresh()` returns the card to its old place. A removal
 * that found no row (another tab got there first) has no `undo` and shows no
 * toast.
 *
 * @param page The page number. Emptying a page past page 1 redirects, which
 * remounts the page, so the heading has to take the focus again.
 * @param returnPath The page, for the session expired toast's Sign in action.
 */
function GameLibraryGrid({
  list,
  items,
  label,
  page,
  returnPath,
}: {
  list: LibraryList;
  items: LibraryGameItem[];
  label: string;
  page: number;
  returnPath: string;
}) {
  const router = useRouter();
  const gridRef = useRef<HTMLUListElement>(null);
  const [visible, hide] = useOptimistic(items, (state, key: string) =>
    state.filter((item) => gameItemKey(item) !== key),
  );

  /**
   * The removal that sent the focus to the heading expecting a remount. If
   * this grid instead receives a refreshed page without that game, the page
   * did not redirect, so the new heading must not take the focus later.
   */
  const headingFocusFor = useRef<string | null>(null);
  useEffect(() => {
    const key = headingFocusFor.current;
    if (key === null || items.some((item) => gameItemKey(item) === key)) {
      return;
    }
    headingFocusFor.current = null;
    cancelLibraryHeadingFocus(key);
  }, [items]);

  /**
   * Focus leaves the card before it disappears: to the nearest following
   * card's name link, else the nearest preceding one's, else the heading. A
   * card with no link (a hidden or missing game) takes the focus on its
   * remove button (AC-13).
   */
  function moveFocusFrom(key: string) {
    const index = visible.findIndex((item) => gameItemKey(item) === key);
    const candidates = [
      ...visible.slice(index + 1),
      ...visible.slice(0, index).reverse(),
    ];

    for (const target of candidates) {
      const card = gridRef.current?.querySelector(
        `[data-item-key="${gameItemKey(target)}"]`,
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

  function remove(item: LibraryGameItem) {
    const key = gameItemKey(item);
    moveFocusFrom(key);

    startTransition(async () => {
      hide(key);
      const result = await settleResultCall(() => removeGame(item.gameId));
      if (!result.ok) {
        if (headingFocusFor.current === key) {
          headingFocusFor.current = null;
        }
        cancelLibraryHeadingFocus(key);
        showGameTrackingError(result.error, {
          id: gameTrackingToastId(item.gameId, "status"),
          returnPath,
          navigate: router.push,
        });
        return;
      }

      showGameUndo({
        gameId: item.gameId,
        undo: result.undo,
        returnPath,
        navigate: router.push,
      });
    });
  }

  return (
    <PosterGrid ref={gridRef} aria-label={label}>
      {visible.map((item, index) => {
        const key = gameItemKey(item);
        return (
          <li key={key} data-item-key={key}>
            <GameLibraryCard
              list={list}
              item={item}
              onRemove={() => remove(item)}
              priority={index < POSTER_GRID_EAGER.catalog}
            />
          </li>
        );
      })}
    </PosterGrid>
  );
}

export { GameLibraryGrid };
