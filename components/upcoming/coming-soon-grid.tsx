"use client";

import { useRouter } from "next/navigation";
import { startTransition, useOptimistic, useRef } from "react";
import { toast } from "sonner";

import { restoreMovieWatchlist, setMovieWatchlist } from "@/app/movies/actions";
import { PosterGrid } from "@/components/poster-grid";
import {
  settleTrackingCall,
  showTrackingError,
} from "@/components/tracking/tracking-toast";
import {
  COMING_SOON_MESSAGES,
  LIBRARY_MESSAGES,
  UNDO_ACTION_LABEL,
  UNDO_EXPIRED_MESSAGES,
} from "@/lib/tracking/messages";
import type { MovieTrackingError } from "@/lib/tracking/types";

import { ComingSoonCard, type ComingSoonItem } from "./coming-soon-card";
import { COMING_SOON_HEADING_ID, UPCOMING_PATH } from "./ids";

/** One full row at the widest grid loads eagerly, as on the list pages. */
const EAGER_POSTERS = 6;

/** Long enough for a keyboard user to reach Undo, as on the list pages. */
const UNDO_TOAST_MS = 10_000;

/**
 * The Coming soon grid and what its Planned bookmark does (spec 0014, AC-12),
 * the spec 0008 removal in `LibraryGrid`'s pattern for movies alone.
 *
 * The tap moves the focus to the next card, else the previous one, else the
 * "Coming soon" heading, then hides the card through `useOptimistic` and runs
 * `setMovieWatchlist(false)`. Its `refresh()` brings the new section in the
 * same response; on a failure the transition ends with the card still in
 * `items`, so it comes back in its place with a toast. Undo is not
 * optimistic: `restoreMovieWatchlist` refreshes, and the server puts the
 * movie back in its date order.
 */
function ComingSoonGrid({ items }: { items: ComingSoonItem[] }) {
  const router = useRouter();
  const gridRef = useRef<HTMLUListElement>(null);
  const [visible, hide] = useOptimistic(items, (state, movieId: number) =>
    state.filter((item) => item.movieId !== movieId),
  );

  function moveFocusFrom(movieId: number) {
    const index = visible.findIndex((item) => item.movieId === movieId);
    const target = visible[index + 1] ?? visible[index - 1];
    if (!target) {
      document.getElementById(COMING_SOON_HEADING_ID)?.focus();
      return;
    }
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-movie-id="${target.movieId}"] h3 a`)
      ?.focus();
  }

  function onError(error: MovieTrackingError, movieId: number) {
    showTrackingError(error, {
      movieId,
      control: "watchlist",
      returnPath: UPCOMING_PATH,
      navigate: router.push,
    });
  }

  /** The list pages' Undo: the toast stays, and loses Undo while it runs. */
  function undo(event: { preventDefault: () => void }, movieId: number) {
    event.preventDefault();
    const id = toastId(movieId);
    toast(LIBRARY_MESSAGES.watchlist.removed, { id, action: undefined });

    startTransition(async () => {
      const error = await settleTrackingCall(() =>
        restoreMovieWatchlist(movieId),
      );
      if (error === "undo_expired") {
        toast(UNDO_EXPIRED_MESSAGES.watchlist, { id, action: undefined });
        return;
      }
      toast.dismiss(id);
      if (error) onError(error, movieId);
    });
  }

  function remove(movieId: number) {
    moveFocusFrom(movieId);

    startTransition(async () => {
      hide(movieId);
      const error = await settleTrackingCall(() =>
        setMovieWatchlist(movieId, false),
      );
      if (error) {
        onError(error, movieId);
        return;
      }
      toast(LIBRARY_MESSAGES.watchlist.removed, {
        id: toastId(movieId),
        duration: UNDO_TOAST_MS,
        action: {
          label: UNDO_ACTION_LABEL,
          onClick: (event) => undo(event, movieId),
        },
      });
    });
  }

  return (
    <PosterGrid ref={gridRef} aria-label={COMING_SOON_MESSAGES.gridLabel}>
      {visible.map((item, index) => (
        <li key={item.movieId} data-movie-id={item.movieId}>
          <ComingSoonCard
            item={item}
            onRemove={() => remove(item.movieId)}
            priority={index < EAGER_POSTERS}
          />
        </li>
      ))}
    </PosterGrid>
  );
}

/** One toast per movie, apart from the list pages' ids. */
function toastId(movieId: number): string {
  return `coming-soon-${movieId}`;
}

export { ComingSoonGrid };
