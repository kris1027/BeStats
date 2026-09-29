"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";

import { setEpisodeWatched, undoEpisodeMark } from "@/app/shows/actions";
import { CardRoundButton } from "@/components/tracking/card-round-button";
import { WatchedIcon } from "@/components/tracking/tracking-icons";
import {
  settleStatusCall,
  showEpisodeTrackingError,
} from "@/components/tracking/tracking-toast";
import { UNDO_ACTION_LABEL, UP_NEXT_MESSAGES } from "@/lib/tracking/messages";

import { UPCOMING_PATH, upNextCardLinkId } from "./ids";

/** Long enough for a keyboard user to reach Undo, as on the list pages. */
const UNDO_TOAST_MS = 10_000;

/**
 * The show whose card link takes the focus once the refresh after a mark or
 * an Undo has rendered (spec 0014, AC-16). Module state, because the button
 * that asked can be replaced by then: a card that is caught up after the
 * mark has no button, and one that comes back after an Undo gets a new one.
 */
let focusCardAfterRefresh: number | null = null;

function focusCard(showId: number) {
  document.getElementById(upNextCardLinkId(showId))?.focus();
}

/**
 * Mark watched on an Up Next card (spec 0014, AC-8 to AC-10, AC-16).
 *
 * The episode comes from the server's `upNextState`, rendered into the props,
 * so the client never picks which episode to mark. The tap runs
 * `setEpisodeWatched` in a transition; the action's own `refresh()` brings
 * the following episode and the card's new place in the same response, and
 * the button stays disabled with `aria-busy` until that has rendered. Nothing
 * is optimistic: a failure leaves the card exactly as it was, with a toast.
 *
 * Undo is offered only when `newlyMarked` says this tap set the mark, and it
 * hands back that mark's `markedAt`, so `undoEpisodeMark` clears it only while
 * it is still the stored one: a mark another tab made in the meantime is
 * refused as `undo_expired`, with its own toast and a refresh. It clears the
 * watched mark alone; a rating stays, and the show's status never changes.
 *
 * Focus follows the card wherever it moves: to its title link once the
 * refresh has rendered, and after an Undo only when the focus was on the
 * toast, so a person who moved on is never pulled back.
 */
function MarkNextWatchedButton({
  showId,
  showName,
  seasonNumber,
  episodeNumber,
  episodeId,
}: {
  showId: number;
  showName: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeId: number;
}) {
  const router = useRouter();
  const [pending, startMark] = useTransition();
  const toastId = upNextCardLinkId(showId);

  // The refresh rendered this card again with a new episode (after a mark,
  // or after an Undo that brought it back), so the focus comes to its link.
  // `episodeId` is here only so the effect runs when the episode changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above.
  useEffect(() => {
    if (focusCardAfterRefresh !== showId) return;
    focusCardAfterRefresh = null;
    focusCard(showId);
  }, [showId, episodeId]);

  // A mark that caught the show up removes this button; the card link is
  // still there, so it takes the focus once the new tree is on screen.
  const showIdRef = useRef(showId);
  showIdRef.current = showId;
  useEffect(
    () => () => {
      const id = showIdRef.current;
      if (focusCardAfterRefresh !== id) return;
      focusCardAfterRefresh = null;
      requestAnimationFrame(() => focusCard(id));
    },
    [],
  );

  function onError(error: Parameters<typeof showEpisodeTrackingError>[0]) {
    showEpisodeTrackingError(error, {
      id: toastId,
      returnPath: UPCOMING_PATH,
      navigate: router.push,
    });
  }

  /**
   * As on the list pages: the click keeps the toast (`preventDefault`) and
   * takes Undo off it while the unmark runs, so a quick failure is not lost
   * in the toast's exit animation and Undo cannot run twice.
   */
  function undo(
    event: { preventDefault: () => void },
    message: string,
    markedAt: string,
  ) {
    event.preventDefault();
    const fromToast =
      document.activeElement?.closest("[data-sonner-toast]") != null;
    toast(message, { id: toastId, action: undefined });

    startTransition(async () => {
      const result = await settleStatusCall(() =>
        undoEpisodeMark(showId, episodeId, markedAt),
      );
      if (!result.ok && result.error === "undo_expired") {
        // Nothing was written, so the action did not refresh; the card
        // should now show the mark the other tab left.
        toast(UP_NEXT_MESSAGES.undoChanged, { id: toastId, action: undefined });
        router.refresh();
        return;
      }
      toast.dismiss(toastId);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      if (fromToast) focusCardAfterRefresh = showId;
    });
  }

  function mark() {
    startMark(async () => {
      const result = await settleStatusCall(() =>
        setEpisodeWatched(showId, seasonNumber, episodeId, true),
      );
      if (!result.ok) {
        onError(result.error);
        return;
      }

      focusCardAfterRefresh = showId;
      const { markedAt } = result;
      if (!result.newlyMarked || markedAt === null) {
        toast(
          UP_NEXT_MESSAGES.alreadyWatched(
            showName,
            seasonNumber,
            episodeNumber,
          ),
          { id: toastId, action: undefined },
        );
        return;
      }

      const message = UP_NEXT_MESSAGES.marked(
        showName,
        seasonNumber,
        episodeNumber,
      );
      toast(message, {
        id: toastId,
        duration: UNDO_TOAST_MS,
        action: {
          label: UNDO_ACTION_LABEL,
          onClick: (event) => undo(event, message, markedAt),
        },
      });
    });
  }

  return (
    <CardRoundButton
      label={UP_NEXT_MESSAGES.markLabel(showName, seasonNumber, episodeNumber)}
      disabled={pending}
      onClick={mark}
      className="ml-auto"
    >
      <WatchedIcon filled={false} className="size-4" />
    </CardRoundButton>
  );
}

export { MarkNextWatchedButton };
