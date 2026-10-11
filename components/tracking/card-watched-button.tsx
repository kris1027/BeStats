"use client";

import { useRouter } from "next/navigation";
import { startTransition, useOptimistic } from "react";

import { setMovieWatched } from "@/app/movies/actions";

import { CardRoundButton } from "./card-round-button";
import { WatchedIcon } from "./tracking-icons";
import { settleResultCall, showTrackingError } from "./tracking-toast";
import { useMovieClearedUndo } from "./use-movie-cleared-undo";

/**
 * The filled watched mark on a catalog poster card for a watched movie
 * (prompts/catalog-card-status.md), the Watched page's button on `/movies`
 * and `/search`.
 *
 * It only unmarks: a movie is marked watched on its own page. Unmarking also
 * removes the score, so the movie page's toast and Undo follow
 * (prompts/movie-plan-watched-exclusive.md). The action's `refresh()` then
 * re-renders the card, which falls back to the TMDB rating and the Plan
 * bookmark; until then the mark shows empty, and a failure rolls it back.
 */
function CardWatchedButton({
  movieId,
  title,
  returnPath,
}: {
  movieId: number;
  title: string;
  returnPath: string;
}) {
  const router = useRouter();
  const [watched, setWatched] = useOptimistic(true);
  const showCleared = useMovieClearedUndo({ movieId, returnPath });

  function unmark() {
    startTransition(async () => {
      setWatched(false);
      const result = await settleResultCall(() =>
        setMovieWatched(movieId, false),
      );
      if (!result.ok) {
        showTrackingError(result.error, {
          movieId,
          control: "watched",
          returnPath,
          navigate: router.push,
        });
        return;
      }
      showCleared("unwatched", result.cleared);
    });
  }

  return (
    <CardRoundButton
      label={`Unmark ${title} as watched`}
      disabled={!watched}
      onClick={unmark}
      className="ml-auto"
    >
      <WatchedIcon filled={watched} className="size-4" />
    </CardRoundButton>
  );
}

export { CardWatchedButton };
