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
import { typedHref } from "@/lib/catalog/media-type";
import {
  SHOW_STATUS_MESSAGES,
  UNDO_ACTION_LABEL,
  UP_NEXT_MESSAGES,
} from "@/lib/tracking/messages";

import {
  UP_NEXT_CARD_LINK_SELECTOR,
  UP_NEXT_HEADING_ID,
  upNextCardLinkId,
} from "./ids";

/** Long enough for a keyboard user to reach Undo, as on the list pages. */
const UNDO_TOAST_MS = 10_000;

/**
 * Where the focus goes once the refresh after a mark or an Undo has rendered
 * (spec 0014, AC-16; spec 0015, AC-7): `showId` is the card that asked, and
 * `targetId` the element to focus, its own title link, or a neighbour's (or
 * the Up Next heading) when the mark completed the show and its card left.
 * Module state, because the button that asked can be replaced by then: a card
 * that is caught up after the mark has no button, one that completed is gone,
 * and one that comes back after an Undo gets a new one.
 */
let focusAfterRefresh: { showId: number; targetId: string } | null = null;

/**
 * The Up Next heading stays on the shows tab when its last card goes, since
 * the section shows its own empty state there (feature 22), so it is always
 * there to take the focus (spec 0015, AC-7).
 */
function focusById(id: string) {
  document.getElementById(id)?.focus();
}

/**
 * Hands the focus back before a toast that holds it closes. Sonner remembers
 * where the focus was before the toast took it and sends it there once the
 * toast list goes, which after a completion is the neighbouring card, and
 * that would land after the returning card took the focus. Blurring first
 * lets Sonner restore (and forget) that element now, so the move to the
 * card that comes back is the last word (spec 0015, AC-7).
 */
function releaseToastFocus() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.closest("[data-sonner-toast]")) {
    active.blur();
  }
}

function focusOwnCardAfterRefresh(showId: number) {
  focusAfterRefresh = { showId, targetId: upNextCardLinkId(showId) };
}

/**
 * The element that takes the focus if this card leaves the list (spec 0015,
 * AC-7): the next card's title link, else the previous card's, else the Up
 * Next heading. Read before the action runs, because the card, and this
 * button with it, is gone once the refresh has rendered.
 */
function focusTargetIfCardLeaves(showId: number): string {
  const item = document.getElementById(upNextCardLinkId(showId))?.closest("li");
  for (const neighbour of [
    item?.nextElementSibling,
    item?.previousElementSibling,
  ]) {
    const link = neighbour?.querySelector<HTMLElement>(
      UP_NEXT_CARD_LINK_SELECTOR,
    );
    if (link?.id) return link.id;
  }
  return UP_NEXT_HEADING_ID;
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
 *
 * A mark that completes the show (spec 0015, AC-4, AC-5, AC-7) says so in the
 * same toast, keeps the same Undo, and sends the focus to the neighbouring
 * card, since this one leaves Up Next. The Undo reopens the show through the
 * database trigger, so the card comes back, first in the list.
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
    if (focusAfterRefresh?.showId !== showId) return;
    const { targetId } = focusAfterRefresh;
    focusAfterRefresh = null;
    focusById(targetId);
  }, [showId, episodeId]);

  // A mark that caught the show up removes this button, and one that
  // completed it removes the whole card; the target is still there, so it
  // takes the focus once the new tree is on screen.
  const showIdRef = useRef(showId);
  showIdRef.current = showId;
  useEffect(
    () => () => {
      if (focusAfterRefresh?.showId !== showIdRef.current) return;
      const { targetId } = focusAfterRefresh;
      focusAfterRefresh = null;
      requestAnimationFrame(() => focusById(targetId));
    },
    [],
  );

  function onError(error: Parameters<typeof showEpisodeTrackingError>[0]) {
    showEpisodeTrackingError(error, {
      id: toastId,
      returnPath: typedHref("/upcoming", "tv"),
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
    // Before the Undo leaves the toast, or the focus would go with it.
    if (fromToast) releaseToastFocus();
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
      if (fromToast) focusOwnCardAfterRefresh(showId);
    });
  }

  function mark() {
    const targetIfCardLeaves = focusTargetIfCardLeaves(showId);
    startMark(async () => {
      const result = await settleStatusCall(() =>
        setEpisodeWatched(showId, seasonNumber, episodeId, true),
      );
      if (!result.ok) {
        onError(result.error);
        return;
      }

      focusAfterRefresh = result.showCompleted
        ? { showId, targetId: targetIfCardLeaves }
        : { showId, targetId: upNextCardLinkId(showId) };
      const { markedAt } = result;
      if (!result.newlyMarked || markedAt === null) {
        if (result.showCompleted) {
          // Marked elsewhere first, so there is no Undo to offer.
          toast(SHOW_STATUS_MESSAGES.completed(showName), {
            id: toastId,
            action: undefined,
          });
          return;
        }
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

      // One toast, even when the same write also started the show (AC-5).
      const message = (
        result.showCompleted
          ? UP_NEXT_MESSAGES.markedCompleted
          : UP_NEXT_MESSAGES.marked
      )(showName, seasonNumber, episodeNumber);
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
