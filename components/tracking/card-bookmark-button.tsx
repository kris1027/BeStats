"use client";

import { useRouter } from "next/navigation";
import { startTransition, useOptimistic } from "react";

import { setMovieWatchlist } from "@/app/movies/actions";

import { CardRoundButton } from "./card-round-button";
import { PlanIcon, PlannedIcon } from "./tracking-icons";
import { settleTrackingCall, showTrackingError } from "./tracking-toast";

/**
 * The round glass bookmark on a poster card, per `bookmark-button` in
 * `design/show-movie-card.svg` (spec 0007, AC-16).
 *
 * The round glass button itself is `CardRoundButton`. It sits above the
 * card's link overlay, so a click toggles the bookmark without opening the
 * movie. The same optimistic and rollback rules as the movie page controls
 * apply (AC-11, AC-15).
 */
function CardBookmarkButton({
  movieId,
  title,
  inWatchlist,
  returnPath,
}: {
  movieId: number;
  title: string;
  inWatchlist: boolean;
  returnPath: string;
}) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useOptimistic(inWatchlist);

  function toggle() {
    const value = !optimistic;
    startTransition(async () => {
      setOptimistic(value);
      const error = await settleTrackingCall(() =>
        setMovieWatchlist(movieId, value),
      );
      if (error) {
        showTrackingError(error, {
          movieId,
          control: "watchlist",
          returnPath,
          navigate: router.push,
        });
      }
    });
  }

  return (
    <CardRoundButton
      label={`Plan ${title}`}
      pressed={optimistic}
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

export { CardBookmarkButton };
