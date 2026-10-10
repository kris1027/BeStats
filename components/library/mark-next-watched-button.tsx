"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";

import { setEpisodeWatched, undoEpisodeMark } from "@/app/shows/actions";
import { CardRoundButton } from "@/components/tracking/card-round-button";
import { WatchedIcon } from "@/components/tracking/tracking-icons";
import {
  settleResultCall,
  showEpisodeTrackingError,
} from "@/components/tracking/tracking-toast";
import { typedHref } from "@/lib/catalog/media-type";
import { MARK_NEXT_MESSAGES, UNDO_ACTION_LABEL } from "@/lib/tracking/messages";

import { neighbourCardTarget } from "./card-focus";
import {
  LIBRARY_HEADING_ID,
  SHOW_CARD_LINK_SELECTOR,
  showCardLinkId,
} from "./ids";

/** Long enough for a keyboard user to reach Undo, as on the list pages. */
const UNDO_TOAST_MS = 10_000;

/**
 * Where the focus goes once the refresh after a mark or an Undo has rendered
 * (spec 0014, AC-16, carried into spec 0020, AC-9): `showId` is the card that
 * asked. If the card is still on Watchlist its button renders again with the
 * next episode and the focus goes to the card's own title link (`stayId`);
 * if the mark moved the show to Upcoming or Watched, the card is gone and the
 * focus goes to a neighbour's link, or the page heading (`leaveId`). Which of
 * the two happens is the server's call, made by classification on refresh,
 * so both are decided before the mark. Module state, because the button that
 * asked can be replaced by then.
 */
let focusAfterRefresh: {
  showId: number;
  stayId: string;
  leaveId: string;
} | null = null;

function focusById(id: string) {
  document.getElementById(id)?.focus();
}

/**
 * Hands the focus back before a toast that holds it closes. Sonner remembers
 * where the focus was before the toast took it and sends it there once the
 * toast list goes, which would land after the returning card took the focus.
 * Blurring first lets Sonner restore (and forget) that element now, so the
 * move to the card that comes back is the last word (spec 0015, AC-7).
 */
function releaseToastFocus() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.closest("[data-sonner-toast]")) {
    active.blur();
  }
}

/**
 * The element that takes the focus if this card leaves Watchlist: the next
 * card's title link, else the previous card's, else the page heading. Read
 * before the action runs, because the card is gone once the refresh has
 * rendered.
 */
function focusTargetIfCardLeaves(showId: number): string {
  const item = document.getElementById(showCardLinkId(showId))?.closest("li");
  const link = neighbourCardTarget(item, SHOW_CARD_LINK_SELECTOR);
  return link?.id || LIBRARY_HEADING_ID;
}

function focusAfter(showId: number) {
  focusAfterRefresh = {
    showId,
    stayId: showCardLinkId(showId),
    leaveId: focusTargetIfCardLeaves(showId),
  };
}

/**
 * Mark watched on a Watchlist show card (spec 0020, AC-9, keeping spec
 * 0014's Up Next behaviour, AC-8 to AC-10, AC-16).
 *
 * The episode comes from the server's classification and its season read,
 * rendered into the props, so the client never picks which episode to mark.
 * The tap runs `setEpisodeWatched` in a transition; the action's own
 * `refresh()` brings the following episode, or the card's departure to
 * Upcoming or Watched, in the same response, and the button stays disabled
 * with `aria-busy` until that has rendered. Nothing is optimistic: a failure
 * leaves the card exactly as it was, with a toast.
 *
 * Undo is offered only when `newlyMarked` says this tap set the mark, and it
 * hands back that mark's `markedAt`, so `undoEpisodeMark` clears it only while
 * it is still the stored one: a mark another tab made in the meantime is
 * refused, with its own toast and a refresh. It clears the watched mark
 * alone; a rating stays, and tracking never changes. An Undo that brings the
 * show back to Watchlist brings its card back too.
 *
 * Focus follows the card wherever it goes (`focusAfterRefresh`), and after
 * an Undo only when the focus was on the toast, so a person who moved on is
 * never pulled back.
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
  const toastId = showCardLinkId(showId);

  // The refresh rendered this card again with a new episode (after a mark,
  // or after an Undo that brought it back), so the focus comes to its link.
  // `episodeId` is here only so the effect runs when the episode changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above.
  useEffect(() => {
    if (focusAfterRefresh?.showId !== showId) return;
    const { stayId } = focusAfterRefresh;
    focusAfterRefresh = null;
    focusById(stayId);
  }, [showId, episodeId]);

  // A mark that moved the show off Watchlist removes the whole card; the
  // target is still there, so it takes the focus once the new tree is on
  // screen.
  const showIdRef = useRef(showId);
  showIdRef.current = showId;
  useEffect(
    () => () => {
      if (focusAfterRefresh?.showId !== showIdRef.current) return;
      const { leaveId } = focusAfterRefresh;
      focusAfterRefresh = null;
      requestAnimationFrame(() => focusById(leaveId));
    },
    [],
  );

  function onError(error: Parameters<typeof showEpisodeTrackingError>[0]) {
    showEpisodeTrackingError(error, {
      id: toastId,
      returnPath: typedHref("/watchlist", "tv"),
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
      const result = await settleResultCall(() =>
        undoEpisodeMark(showId, episodeId, markedAt),
      );
      if (!result.ok && result.error === "undo_expired") {
        // Nothing was written, so the action did not refresh; the card
        // should now show the mark the other tab left.
        toast(MARK_NEXT_MESSAGES.undoChanged, {
          id: toastId,
          action: undefined,
        });
        router.refresh();
        return;
      }
      toast.dismiss(toastId);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      if (fromToast) {
        focusAfterRefresh = {
          showId,
          stayId: showCardLinkId(showId),
          leaveId: LIBRARY_HEADING_ID,
        };
      }
    });
  }

  function mark() {
    focusAfter(showId);
    startMark(async () => {
      const result = await settleResultCall(() =>
        setEpisodeWatched(showId, seasonNumber, episodeId, true),
      );
      if (!result.ok) {
        focusAfterRefresh = null;
        onError(result.error);
        return;
      }

      const { markedAt } = result;
      if (!result.newlyMarked || markedAt === null) {
        toast(
          MARK_NEXT_MESSAGES.alreadyWatched(
            showName,
            seasonNumber,
            episodeNumber,
          ),
          { id: toastId, action: undefined },
        );
        return;
      }

      const message = MARK_NEXT_MESSAGES.marked(
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
      label={MARK_NEXT_MESSAGES.markLabel(
        showName,
        seasonNumber,
        episodeNumber,
      )}
      disabled={pending}
      onClick={mark}
      className="ml-auto"
    >
      <WatchedIcon filled={false} className="size-4" />
    </CardRoundButton>
  );
}

export { MarkNextWatchedButton };
