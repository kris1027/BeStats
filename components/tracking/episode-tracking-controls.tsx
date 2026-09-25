"use client";

import { cn } from "cn";
import { StarIcon } from "lucide-react";
import { useRef, useState } from "react";

import { setEpisodeRating, setEpisodeWatched } from "@/app/shows/actions";
import { glassPillClassName } from "@/components/glass-pill";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatPersonalScore } from "@/lib/format";
import type { EpisodeIntent } from "@/lib/tracking/episode-intent";
import {
  EMPTY_EPISODE_TRACKING,
  type EpisodeTrackingResult,
  type EpisodeTrackingState,
} from "@/lib/tracking/types";

import { ScorePicker } from "./score-picker";
import { useEpisodeStates, useSeasonTracking } from "./season-tracking-store";
import { WatchedIcon } from "./tracking-icons";

/** The movie page's pill sizes: 44px on mobile, 36px from `md` (AC-23). */
const PILL =
  "h-11 cursor-pointer px-4 transition-[filter] hover:brightness-125 md:h-9 md:px-3.5";

/** A pill that cannot act right now: focusable, muted, and inert. */
const PILL_UNAVAILABLE =
  "h-11 cursor-not-allowed px-4 opacity-50 md:h-9 md:px-3.5";

/**
 * One episode's Watched and score pills on a season page (spec 0011, AC-1,
 * AC-2).
 *
 * The same recipe, icons and `ScorePicker` as the movie page, so the two read
 * as one system. The state shown is the confirmed state with every pending
 * click on the page replayed on top, so a season click flips this row too.
 * Each toggle reads its target from that shown state, never the prop, so a
 * double click sends `true` then `false` (AC-16).
 *
 * An `upcoming` episode only reaches here when it already has stored state
 * (TMDB moved its date after it was marked). Then only removals work: the
 * pill can unmark but not mark, and the picker can clear but not score
 * (AC-2).
 *
 * @param label The episode name, or `Episode {n}`, for every accessible name.
 * @param airDate The formatted air date, for the picker's "Airs" note.
 */
function EpisodeTrackingControls({
  episodeId,
  label,
  state,
  upcoming,
  airDate,
}: {
  episodeId: number;
  label: string;
  state: EpisodeTrackingState;
  upcoming: boolean;
  airDate: string | null;
}) {
  const { showId, seasonNumber, run, fail } = useSeasonTracking();
  const shown =
    useEpisodeStates({ [episodeId]: state })[episodeId] ??
    EMPTY_EPISODE_TRACKING;
  const [pickerOpen, setPickerOpen] = useState(false);
  const initialFocusRef = useRef<HTMLButtonElement | null>(null);

  function send(
    control: "watched" | "rating",
    intent: EpisodeIntent,
    call: () => Promise<EpisodeTrackingResult>,
  ) {
    run([intent], call, (result) => {
      if (!result.ok) fail(result.error, `episode-${episodeId}-${control}`);
    });
  }

  const canMark = !upcoming || shown.watched;
  function toggleWatched() {
    if (!canMark) return;
    const value = !shown.watched;
    send("watched", { kind: "watched", episodeId, value }, () =>
      setEpisodeWatched(showId, seasonNumber, episodeId, value),
    );
  }

  function rate(value: number | null) {
    setPickerOpen(false);
    send("rating", { kind: "rating", episodeId, value }, () =>
      setEpisodeRating(showId, seasonNumber, episodeId, value),
    );
  }

  const scoreText = formatPersonalScore(shown.rating);

  return (
    <div data-slot="episode-tracking" className="flex flex-wrap gap-2 pt-1">
      <button
        type="button"
        aria-label={`Mark ${label} watched`}
        aria-pressed={shown.watched}
        aria-disabled={canMark ? undefined : true}
        onClick={toggleWatched}
        className={cn(glassPillClassName(), canMark ? PILL : PILL_UNAVAILABLE)}
      >
        <WatchedIcon filled={shown.watched} />
        <span aria-hidden="true">
          {shown.watched ? "Watched" : "Mark watched"}
        </span>
      </button>

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger
          aria-label={`Your score for ${label}: ${scoreText}`}
          aria-haspopup="dialog"
          className={cn(glassPillClassName("score"), PILL)}
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
            rating={shown.rating}
            onPick={rate}
            onClear={() => rate(null)}
            initialFocusRef={initialFocusRef}
            unavailableNote={
              upcoming && airDate !== null ? `Airs ${airDate}` : undefined
            }
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export { EpisodeTrackingControls };
