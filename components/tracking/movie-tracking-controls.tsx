"use client";

import { cn } from "cn";
import { StarIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useOptimistic, useRef, useState } from "react";

import {
  setMovieRating,
  setMovieWatched,
  setMovieWatchlist,
} from "@/app/movies/actions";
import { glassPillClassName } from "@/components/glass-pill";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatPersonalScore } from "@/lib/format";
import {
  applyTrackingIntent,
  type TrackingIntent,
} from "@/lib/tracking/intent";
import type {
  MovieTrackingResult,
  MovieTrackingState,
} from "@/lib/tracking/types";

import { ScorePicker } from "./score-picker";
import { PlanIcon, PlannedIcon, WatchedIcon } from "./tracking-icons";
import { TRACKING_PILL, TRACKING_PILL_UNAVAILABLE } from "./tracking-pill";
import {
  settleTrackingCall,
  showTrackingError,
  type TrackingControl,
} from "./tracking-toast";

/**
 * The movie page's three tracking pills: Plan, Mark watched and Your score
 * (spec 0007, AC-1).
 *
 * One `useOptimistic` holds the whole state, reduced by the same
 * `applyTrackingIntent` the tests pin against the SQL, so a click shows its
 * result at once, including the couplings (a first watch clears the
 * bookmark). The optimistic value lasts only while the action is in flight:
 * on success it gives way to the prop `refresh()` delivers, on failure to the
 * unchanged prop, which is the rollback (AC-11). The confirmed state is only
 * ever the server's.
 *
 * Every toggle reads its target from the optimistic value, never the prop, so
 * a double click sends `true` then `false` rather than `true` twice (AC-15).
 * The toggles keep a fixed name and report state through `aria-pressed` only,
 * so a screen reader hears one control changing state, not two controls
 * swapping (AC-1).
 *
 * Before the release date only Plan works (prompts/movie-release-gate.md):
 * with no watched mark and no score, the other two pills give way to the
 * release line. With either stored, they mirror the episode controls: the
 * pill can unmark but not mark, and the picker can clear but not score. The
 * branch reads the optimistic state, so removing the last of it shows the
 * line at once, as the server will after `refresh()`.
 */
function MovieTrackingControls({
  movieId,
  title,
  state,
  returnPath,
  releaseNote,
}: {
  movieId: number;
  title: string;
  state: MovieTrackingState;
  /** Where the session expired toast's Sign in action comes back to. */
  returnPath: string;
  /**
   * Before release, the line it shows: "Releases Oct 24, 2026" or "Release
   * date to be announced". Null once TMDB's release date is today or earlier
   * (UTC).
   */
  releaseNote: string | null;
}) {
  const router = useRouter();
  const [optimistic, addIntent] = useOptimistic(state, applyTrackingIntent);
  const [pickerOpen, setPickerOpen] = useState(false);
  const initialFocusRef = useRef<HTMLButtonElement | null>(null);

  function run(
    control: TrackingControl,
    intent: TrackingIntent,
    call: () => Promise<MovieTrackingResult>,
  ) {
    startTransition(async () => {
      addIntent(intent);
      const error = await settleTrackingCall(call);
      if (error) {
        showTrackingError(error, {
          movieId,
          control,
          returnPath,
          navigate: router.push,
        });
      }
    });
  }

  function toggleWatchlist() {
    const value = !optimistic.inWatchlist;
    run("watchlist", { kind: "watchlist", value }, () =>
      setMovieWatchlist(movieId, value),
    );
  }

  const canMark = releaseNote === null || optimistic.watched;
  function toggleWatched() {
    if (!canMark) return;
    const value = !optimistic.watched;
    run("watched", { kind: "watched", value }, () =>
      setMovieWatched(movieId, value),
    );
  }

  function rate(value: number | null) {
    setPickerOpen(false);
    run("rating", { kind: "rating", value }, () =>
      setMovieRating(movieId, value),
    );
  }

  const scoreText = formatPersonalScore(optimistic.rating);
  const planOnly =
    releaseNote !== null && !optimistic.watched && optimistic.rating === null;

  const planPill = (
    <button
      type="button"
      aria-label={`Plan ${title}`}
      aria-pressed={optimistic.inWatchlist}
      onClick={toggleWatchlist}
      className={cn(glassPillClassName(), TRACKING_PILL)}
    >
      {optimistic.inWatchlist ? <PlannedIcon /> : <PlanIcon />}
      <span aria-hidden="true">
        {optimistic.inWatchlist ? "Planned" : "Plan"}
      </span>
    </button>
  );

  if (planOnly) {
    return (
      <div
        data-slot="movie-tracking"
        className="flex flex-wrap items-center gap-x-3 gap-y-2"
      >
        {planPill}
        <p
          data-slot="movie-release-note"
          className="text-sm text-text-secondary"
        >
          {releaseNote}
        </p>
      </div>
    );
  }

  return (
    <div data-slot="movie-tracking" className="flex flex-wrap gap-2">
      {planPill}

      <button
        type="button"
        aria-label={`Mark ${title} watched`}
        aria-pressed={optimistic.watched}
        aria-disabled={canMark ? undefined : true}
        onClick={toggleWatched}
        className={cn(
          glassPillClassName(),
          canMark ? TRACKING_PILL : TRACKING_PILL_UNAVAILABLE,
        )}
      >
        <WatchedIcon filled={optimistic.watched} />
        <span aria-hidden="true">
          {optimistic.watched ? "Watched" : "Mark watched"}
        </span>
      </button>

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger
          aria-label={`Your score for ${title}: ${scoreText}`}
          aria-haspopup="dialog"
          className={cn(glassPillClassName("score"), TRACKING_PILL)}
        >
          <StarIcon
            aria-hidden="true"
            className="size-3.5 fill-score-personal text-score-personal"
          />
          <span aria-hidden="true">{scoreText}</span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          initialFocus={initialFocusRef}
          className="w-auto max-w-[calc(100vw-2rem)]"
        >
          <PopoverTitle className="text-sm font-bold text-foreground">
            Your score
          </PopoverTitle>
          <ScorePicker
            rating={optimistic.rating}
            onPick={rate}
            onClear={() => rate(null)}
            initialFocusRef={initialFocusRef}
            unavailableNote={releaseNote ?? undefined}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export { MovieTrackingControls };
