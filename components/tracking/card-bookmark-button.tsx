"use client";

import { useRouter } from "next/navigation";
import { startTransition, useOptimistic } from "react";

import { setMovieWatchlist } from "@/app/movies/actions";

import { PlanIcon, PlannedIcon } from "./tracking-icons";
import { settleTrackingCall, showTrackingError } from "./tracking-toast";

/**
 * The round glass bookmark on a poster card, per `bookmark-button` in
 * `design/show-movie-card.svg` (spec 0007, AC-16).
 *
 * The drawn circle is about 36px; the button around it is 44px on mobile so a
 * thumb can hit it, and shrinks to the circle from `md`. It sits above the
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
    <button
      type="button"
      aria-label={`Plan ${title}`}
      aria-pressed={optimistic}
      onClick={toggle}
      className="ml-auto flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full md:size-9"
    >
      <span className="glass glass-rim glass-plate glass-shadow flex size-9 items-center justify-center rounded-full backdrop-blur-glass transition-[filter] hover:brightness-125">
        {optimistic ? (
          <PlannedIcon className="size-4" />
        ) : (
          <PlanIcon className="size-4" />
        )}
      </span>
    </button>
  );
}

export { CardBookmarkButton };
