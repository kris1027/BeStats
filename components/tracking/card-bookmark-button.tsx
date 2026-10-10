"use client";

import { useRouter } from "next/navigation";
import { startTransition, useOptimistic } from "react";

import { setMovieWatchlist } from "@/app/movies/actions";

import { CardRoundButton } from "./card-round-button";
import { PlanIcon, PlannedIcon } from "./tracking-icons";
import { settleResultCall, showTrackingError } from "./tracking-toast";
import { useMovieClearedUndo } from "./use-movie-cleared-undo";

/**
 * The round glass bookmark on a poster card (spec 0007, AC-16).
 *
 * The round glass button itself is `CardRoundButton`. It sits above the
 * card's link overlay, so a click toggles the bookmark without opening the
 * movie. The same optimistic and rollback rules as the movie page controls
 * apply (AC-11, AC-15). Planning a watched movie removes its watch mark and
 * score, so the same Undo toast as the movie page follows
 * (prompts/movie-plan-watched-exclusive.md).
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
  const showCleared = useMovieClearedUndo({ movieId, returnPath });

  function toggle() {
    const value = !optimistic;
    startTransition(async () => {
      setOptimistic(value);
      const result = await settleResultCall(() =>
        setMovieWatchlist(movieId, value),
      );
      if (!result.ok) {
        showTrackingError(result.error, {
          movieId,
          control: "watchlist",
          returnPath,
          navigate: router.push,
        });
        return;
      }
      // The Undo marks the movie watched again, which takes the plan off.
      showCleared("planned", result.cleared, () => setOptimistic(false));
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
