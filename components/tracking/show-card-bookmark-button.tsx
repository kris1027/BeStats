"use client";

import { useOptimistic } from "react";

import type { ShowTrackingState } from "@/lib/tracking/types";

import { CardRoundButton } from "./card-round-button";
import { PlanIcon, PlannedIcon } from "./tracking-icons";
import { useShowTracking } from "./use-show-tracking";

/**
 * The round glass TV bookmark on a poster card (spec 0020, AC-6), the show
 * twin of `CardBookmarkButton`.
 *
 * Empty, a click tracks the show; filled (tracked, held or not), a click
 * stops tracking it, with the Undo of the show page's Stop tracking (AC-3).
 * It sits above the card's link overlay, so a click never opens the show.
 * The icon flips at once and returns to the server's state if the write
 * fails. Stop tracking names the hold this card showed, so a card rendered
 * before the show changed elsewhere refreshes instead (AC-4). The accessible
 * name says what the click will do, since the two states act differently.
 */
function ShowCardBookmarkButton({
  showId,
  name,
  state,
  returnPath,
}: {
  showId: number;
  name: string;
  state: ShowTrackingState | null;
  returnPath: string;
}) {
  const [shown, setShown] = useOptimistic(state);
  const tracking = useShowTracking({
    showId,
    showName: name,
    returnPath,
    toastId: `show-bookmark-${showId}`,
  });

  function toggle() {
    if (shown === null) {
      tracking.track({ before: () => setShown({ hold: null }) });
      return;
    }
    const expected = shown.hold;
    tracking.untrack(expected, {
      before: () => setShown(null),
      restoring: () => setShown({ hold: expected }),
    });
  }

  return (
    <CardRoundButton
      label={shown ? `Stop tracking ${name}` : `Track ${name}`}
      onClick={toggle}
      className="ml-auto"
    >
      {shown ? (
        <PlannedIcon className="size-4" />
      ) : (
        <PlanIcon className="size-4" />
      )}
    </CardRoundButton>
  );
}

export { ShowCardBookmarkButton };
