"use client";

import { useRouter } from "next/navigation";
import { startTransition, useOptimistic } from "react";

import { setShowStatus } from "@/app/shows/actions";

import { CardRoundButton } from "./card-round-button";
import { PlanIcon, PlannedIcon } from "./tracking-icons";
import { settleStatusCall, showStatusError } from "./tracking-toast";

/**
 * The round glass TV bookmark on a poster card (spec 0013, AC-18), the show
 * twin of `CardBookmarkButton`.
 *
 * Plan sets Want to Watch; Planned removes the status. It sits above the
 * card's link overlay, so a click never opens the show. The same optimistic
 * and rollback rules as every tracking control apply: the icon flips at once
 * and returns to the server's state if the write fails. The accessible name
 * says what the click will do, since the two states act differently.
 */
function ShowCardBookmarkButton({
  showId,
  name,
  planned,
  returnPath,
}: {
  showId: number;
  name: string;
  planned: boolean;
  returnPath: string;
}) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useOptimistic(planned);

  function toggle() {
    const value = !optimistic;
    startTransition(async () => {
      setOptimistic(value);
      const result = await settleStatusCall(() =>
        setShowStatus(showId, value ? "want_to_watch" : null),
      );
      if (!result.ok) {
        showStatusError(result.error, {
          id: `show-bookmark-${showId}`,
          returnPath,
          navigate: router.push,
        });
      }
    });
  }

  return (
    <CardRoundButton
      label={optimistic ? `Remove ${name} from Watchlist` : `Plan ${name}`}
      onClick={toggle}
      className="ml-auto"
    >
      {optimistic ? (
        <PlannedIcon className="size-4" />
      ) : (
        <PlanIcon className="size-4" />
      )}
    </CardRoundButton>
  );
}

export { ShowCardBookmarkButton };
