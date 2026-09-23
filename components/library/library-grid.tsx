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
  settleTrackingCall,
  showTrackingError,
} from "@/components/tracking/tracking-toast";
import {
  LIBRARY_MESSAGES,
  UNDO_ACTION_LABEL,
  UNDO_EXPIRED_MESSAGES,
} from "@/lib/tracking/messages";
import type { MovieTrackingError } from "@/lib/tracking/types";

import { LibraryCard } from "./library-card";
import {
  cancelLibraryHeadingFocus,
  focusLibraryHeading,
} from "./library-heading";
import type { LibraryItem, LibraryList } from "./types";

/**
 * Cards whose posters load eagerly: one full row at the widest grid, as on
 * `/movies`.
 */
const EAGER_POSTERS = 6;

/** Long enough for a keyboard user to reach Undo; the server allows 10 min. */
const UNDO_TOAST_MS = 10_000;

/**
 * The card grid on `/watchlist` and `/watched`, and everything a removal does
 * (spec 0008, AC-5 to AC-7, AC-16, AC-18).
 *
 * A removal hides the card at once through `useOptimistic`, then runs the
 * spec 0007 action. The action's `refresh()` delivers the new page in the same
 * response, so on success the hidden card is simply absent from the next
 * `items` and the next movie moves up from the following page. On failure the
 * transition ends with the card still in `items`, so it reappears in its place
 * with no rollback code at all. Each removal is its own transition with its
 * own toast, so several in a row never interfere (AC-18).
 *
 * Undo is not optimistic: the restored card needs the server's order, and
 * `refresh()` brings it back in its old place.
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
  items: LibraryItem[];
  label: string;
  page: number;
  returnPath: string;
}) {
  const router = useRouter();
  const gridRef = useRef<HTMLUListElement>(null);
  const [visible, hide] = useOptimistic(items, (state, movieId: number) =>
    state.filter((item) => item.movieId !== movieId),
  );

  /**
   * The removal that sent the focus to the heading expecting a remount. If
   * this grid instead receives a refreshed page without that movie, the page
   * did not redirect (later pages moved up), so the new heading must not
   * take the focus on some later visit.
   */
  const headingFocusFor = useRef<number | null>(null);
  useEffect(() => {
    const movieId = headingFocusFor.current;
    if (movieId === null || items.some((item) => item.movieId === movieId)) {
      return;
    }
    headingFocusFor.current = null;
    cancelLibraryHeadingFocus(movieId);
  }, [items]);

  /**
   * Focus leaves the card before it disappears: to the next card's title
   * link, else the previous card's, else the heading. A card with no title
   * link (a missing title) takes the focus on its remove button (AC-16).
   */
  function moveFocusFrom(movieId: number) {
    const index = visible.findIndex((item) => item.movieId === movieId);
    const target = visible[index + 1] ?? visible[index - 1];

    if (!target) {
      const remountFor = page > 1 ? movieId : null;
      headingFocusFor.current = remountFor;
      focusLibraryHeading({ remountFor });
      return;
    }

    const card = gridRef.current?.querySelector(
      `[data-movie-id="${target.movieId}"]`,
    );
    const focusable =
      card?.querySelector<HTMLElement>("h3 a") ??
      card?.querySelector<HTMLElement>("button");
    focusable?.focus();
  }

  function onError(error: MovieTrackingError, movieId: number) {
    showTrackingError(error, {
      movieId,
      control: list,
      returnPath,
      navigate: router.push,
    });
  }

  /**
   * Sonner deletes a toast once its action runs, after a short exit
   * animation. An outcome that lands inside that animation merges into the
   * dying toast and vanishes with it, which is how a quick "Couldn't undo"
   * went unseen. So the click keeps the toast (`preventDefault`), takes the
   * Undo off it while the restore runs (no second restore), and the outcome
   * then closes it or rewrites it in place.
   */
  function undo(event: { preventDefault: () => void }, item: LibraryItem) {
    event.preventDefault();
    const id = toastId(list, item);
    toast(LIBRARY_MESSAGES[list].removed, { id, action: undefined });

    startTransition(async () => {
      const error = await settleTrackingCall(() =>
        list === "watchlist"
          ? restoreMovieWatchlist(item.movieId)
          : restoreMovieWatched(item.movieId, item.watchedAt ?? ""),
      );
      if (error === "undo_expired") {
        // Sonner merges an update into the toast with the same id, so the
        // removal's score line survives unless cleared explicitly.
        toast(UNDO_EXPIRED_MESSAGES[list], {
          id,
          description: undefined,
          action: undefined,
        });
        return;
      }
      toast.dismiss(id);
      if (error) onError(error, item.movieId);
    });
  }

  function remove(item: LibraryItem) {
    moveFocusFrom(item.movieId);

    startTransition(async () => {
      hide(item.movieId);
      const error = await settleTrackingCall(() =>
        list === "watchlist"
          ? setMovieWatchlist(item.movieId, false)
          : setMovieWatched(item.movieId, false),
      );
      if (error) {
        if (headingFocusFor.current === item.movieId) {
          headingFocusFor.current = null;
        }
        cancelLibraryHeadingFocus(item.movieId);
        onError(error, item.movieId);
        return;
      }

      toast(LIBRARY_MESSAGES[list].removed, {
        id: toastId(list, item),
        description:
          list === "watched" && item.rating !== null
            ? LIBRARY_MESSAGES.watched.scoreKept
            : undefined,
        duration: UNDO_TOAST_MS,
        action: {
          label: UNDO_ACTION_LABEL,
          onClick: (event) => undo(event, item),
        },
      });
    });
  }

  return (
    <PosterGrid ref={gridRef} aria-label={label}>
      {visible.map((item, index) => (
        <li key={item.movieId} data-movie-id={item.movieId}>
          <LibraryCard
            list={list}
            item={item}
            onRemove={() => remove(item)}
            priority={index < EAGER_POSTERS}
          />
        </li>
      ))}
    </PosterGrid>
  );
}

/** One toast per list and movie: its removal, then its Undo's outcome. */
function toastId(list: LibraryList, item: LibraryItem): string {
  return `library-${list}-${item.movieId}`;
}

export { LibraryGrid };
