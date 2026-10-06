"use client";

import { useRouter } from "next/navigation";
import {
  type ReactNode,
  startTransition,
  useEffect,
  useOptimistic,
  useRef,
} from "react";
import { toast } from "sonner";

import {
  restoreMovieWatched,
  restoreMovieWatchlist,
  setMovieWatched,
  setMovieWatchlist,
} from "@/app/movies/actions";
import { restoreShowStatus, setShowStatus } from "@/app/shows/actions";
import { PosterGrid } from "@/components/poster-grid";
import {
  settleStatusCall,
  settleTrackingCall,
  showStatusError,
  showTrackingError,
} from "@/components/tracking/tracking-toast";
import {
  LIBRARY_MESSAGES,
  SHOW_STATUS_MESSAGES,
  UNDO_ACTION_LABEL,
  UNDO_EXPIRED_MESSAGES,
} from "@/lib/tracking/messages";
import type { ShowStatusError, ShowStatusUndo } from "@/lib/tracking/types";

import { LibraryCard } from "./library-card";
import {
  cancelLibraryHeadingFocus,
  focusLibraryHeading,
} from "./library-heading";
import { type LibraryItem, type LibraryList, libraryItemKey } from "./types";

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
 * A show card on the watchlist (spec 0013, AC-16) removes itself the same
 * way, through the show status action: the Planned bookmark removes the
 * status, Stop watching sets On Hold. Its toast names the show and its Undo
 * puts back the status, source and place the action reported.
 *
 * @param page The page number. Emptying a page past page 1 redirects, which
 * remounts the page, so the heading has to take the focus again (AC-9).
 * @param returnPath The page, for the session expired toast's Sign in action.
 * @param nextEpisodes Each show card's streamed Next episode pill, keyed by
 * `libraryItemKey`, rendered on the server in its own Suspense boundary.
 */
function LibraryGrid({
  list,
  items,
  label,
  page,
  returnPath,
  nextEpisodes = {},
}: {
  list: LibraryList;
  items: LibraryItem[];
  label: string;
  page: number;
  returnPath: string;
  nextEpisodes?: Record<string, ReactNode>;
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
   * button (AC-16); one with neither (a missing title show on `/watched`,
   * spec 0019) is skipped.
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

  function onError(error: ShowStatusError, item: LibraryItem) {
    if (item.kind === "tv") {
      showStatusError(error, {
        id: toastId(list, item),
        returnPath,
        navigate: router.push,
      });
      return;
    }
    // Only a status write can report a status changed elsewhere.
    if (error === "status_changed") return;
    showTrackingError(error, {
      movieId: item.tmdbId,
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
  function undo(
    event: { preventDefault: () => void },
    item: LibraryItem,
    message: string,
    showUndo: ShowStatusUndo | null,
  ) {
    event.preventDefault();
    const id = toastId(list, item);
    toast(message, { id, action: undefined });

    startTransition(async () => {
      const error = await settleTrackingCall(async () => {
        if (item.kind === "tv") {
          // Only reached with an Undo: the toast offered none without one.
          if (showUndo === null) return { ok: true as const };
          return restoreShowStatus(item.tmdbId, showUndo);
        }
        return list === "watchlist"
          ? restoreMovieWatchlist(item.tmdbId)
          : restoreMovieWatched(item.tmdbId, item.watchedAt ?? "");
      });
      if (error === "undo_expired") {
        // Sonner merges an update into the toast with the same id, so the
        // removal's score line survives unless cleared explicitly.
        toast(
          item.kind === "tv"
            ? SHOW_STATUS_MESSAGES.undoExpired
            : UNDO_EXPIRED_MESSAGES[list],
          { id, description: undefined, action: undefined },
        );
        return;
      }
      toast.dismiss(id);
      if (error) onError(error, item);
    });
  }

  /**
   * The write a card's button makes, and the toast that confirms it. A movie
   * uses the spec 0007 actions and needs no payload for its Undo; a show's
   * Undo is what `setShowStatus` reported replacing. A show's write names the
   * status the card showed, so a card rendered before the status changed
   * elsewhere comes back with `status_changed` instead of deleting or
   * overwriting the newer status.
   */
  async function removeWrite(
    item: LibraryItem,
  ): Promise<
    | { ok: true; message: string; showUndo: ShowStatusUndo | null }
    | { ok: false; error: ShowStatusError }
  > {
    if (item.kind === "tv") {
      const stopping = item.status === "watching";
      const result = await settleStatusCall(() =>
        setShowStatus(item.tmdbId, stopping ? "on_hold" : null, item.status),
      );
      if (!result.ok) return result;
      // A missing title's fallback opens one sentence and sits mid sentence
      // in the other, so each message gets the casing its position needs.
      return {
        ok: true,
        message: stopping
          ? SHOW_STATUS_MESSAGES.stopped(item.title ?? "This show")
          : SHOW_STATUS_MESSAGES.removed(item.title ?? "this show"),
        showUndo: result.undo,
      };
    }
    const error = await settleTrackingCall(() =>
      list === "watchlist"
        ? setMovieWatchlist(item.tmdbId, false)
        : setMovieWatched(item.tmdbId, false),
    );
    if (error) return { ok: false, error };
    return {
      ok: true,
      message: LIBRARY_MESSAGES[list].removed,
      showUndo: null,
    };
  }

  function remove(item: LibraryItem) {
    const key = libraryItemKey(item);
    moveFocusFrom(key);

    startTransition(async () => {
      hide(key);
      const result = await removeWrite(item);
      if (!result.ok) {
        if (headingFocusFor.current === key) {
          headingFocusFor.current = null;
        }
        cancelLibraryHeadingFocus(key);
        onError(result.error, item);
        return;
      }

      // A show whose row was already gone has nothing to put back.
      const canUndo = item.kind === "movie" || result.showUndo !== null;
      toast(result.message, {
        id: toastId(list, item),
        description:
          list === "watched" && item.kind === "movie" && item.rating !== null
            ? LIBRARY_MESSAGES.watched.scoreKept
            : undefined,
        duration: UNDO_TOAST_MS,
        action: canUndo
          ? {
              label: UNDO_ACTION_LABEL,
              onClick: (event) =>
                undo(event, item, result.message, result.showUndo),
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
              nextEpisode={nextEpisodes[key]}
              onRemove={() => remove(item)}
              priority={index < EAGER_POSTERS}
            />
          </li>
        );
      })}
    </PosterGrid>
  );
}

/**
 * One toast per list and card: its removal, then its Undo's outcome. A movie
 * keeps the spec 0008 id; a show's carries its kind, since the ids can meet.
 */
function toastId(list: LibraryList, item: LibraryItem): string {
  return item.kind === "tv"
    ? `library-${list}-tv-${item.tmdbId}`
    : `library-${list}-${item.tmdbId}`;
}

export { LibraryGrid };
