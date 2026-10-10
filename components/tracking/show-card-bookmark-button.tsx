"use client";

import { CardRoundButton } from "./card-round-button";
import { PlanIcon, PlannedIcon } from "./tracking-icons";
import { useShowTrackingToggle } from "./use-show-tracking";

/**
 * The round glass TV bookmark on a poster card (spec 0020, AC-6), the show
 * twin of `CardBookmarkButton`.
 *
 * Empty, a click tracks the show; filled (tracked), a click stops tracking
 * it, with the Undo of the show page's Stop tracking (AC-3). It sits above
 * the card's link overlay, so a click never opens the show. The icon flips
 * at once and returns to the server's state if the write fails. The
 * accessible name says what the click will do, since the two states act
 * differently.
 */
function ShowCardBookmarkButton({
  showId,
  name,
  tracked,
  returnPath,
}: {
  showId: number;
  name: string;
  tracked: boolean;
  returnPath: string;
}) {
  const { shown, toggle } = useShowTrackingToggle(tracked, {
    showId,
    showName: name,
    returnPath,
    toastId: `show-bookmark-${showId}`,
  });

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
