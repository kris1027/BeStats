"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useOptimistic, useRef } from "react";
import { toast } from "sonner";

import {
  restoreMovieWatched,
  restoreMovieWatchlist,
  setMovieWatched,
  setMovieWatchlist,
} from "@/app/movies/actions";
import { PosterGrid } from "@/components/poster-grid";
import {
  runUndoInToast,
  settleResultCall,
  showTrackingError,
  UNDO_TOAST_MS,
} from "@/components/tracking/tracking-toast";
import {
  LIBRARY_MESSAGES,
  UNDO_ACTION_LABEL,
  UNDO_EXPIRED_MESSAGES,
} from "@/lib/tracking/messages";
import type {
  MovieClearedState,
  MovieTrackingError,
} from "@/lib/tracking/types";

import { LibraryCard } from "./library-card";
import {
  cancelLibraryHeadingFocus,
  focusLibraryHeading,
} from "./library-heading";
import {
  type LibraryList,
  type LibraryMovieItem,
  libraryItemKey,
} from "./types";

/**
 * Cards whose posters load eagerly: one full row at the widest grid, as on
 * `/movies`.
 */
const EAGER_POSTERS = 6;

/**
 * The movie grid on `/watchlist`, `/upcoming` and `/watched`, and everything
 * a removal does (spec 0008, AC-5 to AC-7, AC-16, AC-18; spec 0020, AC-13).
 *
 * A removal hides the card at once through `useOptimistic`, then runs the
 * spec 0007 action: unplanning on Watchlist and Upcoming, unmarking on
 * Watched. The action's `refresh()` delivers the new page in the same
 * response, so on success the hidden card is simply absent from the next
 * `items` and the next movie moves up from the following page. On failure
 * the transition ends with the card still in `items`, so it reappears in its
 * place with no rollback code at all. Each removal is its own transition with
 * its own toast, so several in a row never interfere (AC-18).
 *
 * Undo is not optimistic: the restored card needs the server's order, and
 * `refresh()` brings it back in its old place. A watched movie is never
 * planned, so unmarking one on Watched leaves it on no page, and its score
 * goes with the mark; the Undo puts back what the write says it cleared
 * (prompts/movie-plan-watched-exclusive.md, decision 9). When it cleared
 * nothing, because another tab unmarked the movie first, there is nothing
 * to put back and the toast offers no Undo.
 *
 * @param page The page number. Emptying a page past page 1 redirects, which
 * remounts the page, so the heading has to take the focus again (AC-9).
 * @param returnPath The page, for the session expired toast's Sign in action.
 */
function LibraryGrid({
  list,
  items,
  label,
  page,
  returnPath,
}: {
  list: LibraryList;
  items: LibraryMovieItem[];
  label: string;
  page: number;
  returnPath: string;
}) {
  const router = useRouter();
  const gridRef = useRef<HTMLUListElement>(null);
  const [visible, hide] = useOptimistic(items, (state, key: string) =>
    state.filter((item) => libraryItemKey(item) !== key),
  );

  /**
   * The removal that sent the focus to the heading expecting a remount. If
   * this grid instead receives a refreshed page without that movie, the page
   * did not redirect (later pages moved up), so the new heading must not
   * take the focus on some later visit.
   */
  const headingFocusFor = useRef<string | null>(null);
  useEffect(() => {
    const key = headingFocusFor.current;
    if (key === null || items.some((item) => libraryItemKey(item) === key)) {
      return;
    }
    headingFocusFor.current = null;
    cancelLibraryHeadingFocus(key);
  }, [items]);

  /**
   * Focus leaves the card before it disappears: to the nearest following
   * card's title link, else the nearest preceding one's, else the heading. A
   * card with no title link (a missing title) takes the focus on its remove
   * button (AC-16).
   */
  function moveFocusFrom(key: string) {
    const index = visible.findIndex((item) => libraryItemKey(item) === key);
    const candidates = [
      ...visible.slice(index + 1),
      ...visible.slice(0, index).reverse(),
    ];

    for (const target of candidates) {
      const card = gridRef.current?.querySelector(
        `[data-item-key="${libraryItemKey(target)}"]`,
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

  function onError(error: MovieTrackingError, item: LibraryMovieItem) {
    showTrackingError(error, {
      movieId: item.tmdbId,
      control: list === "watched" ? "watched" : "watchlist",
      returnPath,
      navigate: router.push,
    });
  }

  /**
   * Restores a removal. On Watched it hands back exactly what the unmark
   * returned, never the page's copy, which another tab may have changed.
   */
  function restore(item: LibraryMovieItem, cleared: MovieClearedState | null) {
    if (cleared) {
      return restoreMovieWatched(
        item.tmdbId,
        cleared.watchedAt,
        cleared.rating,
      );
    }
    return restoreMovieWatchlist(item.tmdbId);
  }

  function remove(item: LibraryMovieItem) {
    const key = libraryItemKey(item);
    moveFocusFrom(key);

    startTransition(async () => {
      hide(key);
      const result = await settleResultCall(() =>
        list === "watched"
          ? setMovieWatched(item.tmdbId, false)
          : setMovieWatchlist(item.tmdbId, false),
      );
      if (!result.ok) {
        const { error } = result;
        if (headingFocusFor.current === key) {
          headingFocusFor.current = null;
        }
        cancelLibraryHeadingFocus(key);
        onError(error, item);
        return;
      }

      // Unmarking removes the score too, and the write says what it removed
      // (prompts/movie-plan-watched-exclusive.md). An unmark that removed
      // nothing has nothing to undo.
      const cleared = list === "watched" ? (result.cleared ?? null) : null;
      const undoable = list !== "watched" || cleared !== null;
      const id = toastId(list, item);
      const message = LIBRARY_MESSAGES[list].removed;
      toast(message, {
        id,
        description:
          cleared && cleared.rating !== null
            ? LIBRARY_MESSAGES.watched.scoreRemoved
            : undefined,
        duration: UNDO_TOAST_MS,
        action: undoable
          ? {
              label: UNDO_ACTION_LABEL,
              onClick: (event) =>
                runUndoInToast(event, {
                  id,
                  message,
                  expiredMessage: UNDO_EXPIRED_MESSAGES[list],
                  restore: () => restore(item, cleared),
                  onError: (error) => onError(error, item),
                }),
            }
          : undefined,
      });
    });
  }

  return (
    <PosterGrid ref={gridRef} aria-label={label}>
      {visible.map((item, index) => {
        const key = libraryItemKey(item);
        return (
          <li key={key} data-item-key={key}>
            <LibraryCard
              list={list}
              item={item}
              onRemove={() => remove(item)}
              priority={index < EAGER_POSTERS}
            />
          </li>
        );
      })}
    </PosterGrid>
  );
}

/** One toast per list and movie, the spec 0008 id. */
function toastId(list: LibraryList, item: LibraryMovieItem): string {
  return `library-${list}-${item.tmdbId}`;
}

export { LibraryGrid };
