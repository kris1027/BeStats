"use client";

import { cn } from "cn";
import { toast } from "sonner";

import { setSeasonWatched, undoSeasonWatched } from "@/app/shows/actions";
import { glassPillClassName } from "@/components/glass-pill";
import type {
  EpisodeIntent,
  EpisodeStates,
} from "@/lib/tracking/episode-intent";
import { SEASON_MESSAGES, UNDO_ACTION_LABEL } from "@/lib/tracking/messages";
import type { SeasonUndo } from "@/lib/tracking/types";
import {
  airedEpisodesForMarking,
  type SeasonEpisode,
  seasonWatchSummary,
} from "@/lib/tv/season-watch";

import { useEpisodeStates, useSeasonTracking } from "./season-tracking-store";
import { WatchedIcon } from "./tracking-icons";

/** How long a season toast offers its Undo, as on the list pages. */
const UNDO_TOAST_MS = 10_000;

/** The pill recipe at the touch sizes: 44px on mobile, 36px from `md`. */
const PILL = "h-11 px-4 md:h-9 md:px-3.5";

/**
 * The season header's button and count (spec 0011, AC-8 to AC-11).
 *
 * The count and state come from `seasonWatchSummary` over the confirmed
 * states with every pending click replayed, so an episode click moves the
 * count at once and a season click flips every row with it (AC-13). The aired
 * set uses the `today` the server passed, never this browser's clock, so the
 * optimistic rows are exactly the ones the action will write.
 *
 * "Nothing aired yet" is `aria-disabled` rather than `disabled`, so it stays
 * in the keyboard order and a screen reader can still reach and read it.
 *
 * A season write confirms itself with a toast, because one click can change
 * dozens of rows; the toast carries the Undo.
 */
function SeasonWatchedControl({
  seasonName,
  episodes,
  states,
  today,
}: {
  seasonName: string;
  episodes: SeasonEpisode[];
  states: EpisodeStates;
  today: string;
}) {
  const { showId, seasonNumber, run, fail } = useSeasonTracking();
  const shown = useEpisodeStates(states);
  const summary = seasonWatchSummary(episodes, shown, today);
  const toastId = `season-${showId}-${seasonNumber}`;

  function mark() {
    const aired = airedEpisodesForMarking(episodes, today);
    run(
      [{ kind: "season_mark", episodeIds: aired.ids }],
      () => setSeasonWatched(showId, seasonNumber, true),
      (result) => {
        if (!result.ok) return fail(result.error, toastId);
        if (result.undo === null) {
          toast(SEASON_MESSAGES.nothingToMark, {
            id: toastId,
            description: undefined,
            action: undefined,
          });
          return;
        }
        offerUndo(SEASON_MESSAGES.marked(countOf(result.undo)), result.undo);
      },
    );
  }

  function unmark() {
    const ids = episodes.map((episode) => episode.id);
    run(
      [{ kind: "season_unmark", episodeIds: ids }],
      () => setSeasonWatched(showId, seasonNumber, false, ids),
      (result) => {
        if (!result.ok) return fail(result.error, toastId);
        if (result.undo === null) return;
        offerUndo(SEASON_MESSAGES.unmarked(countOf(result.undo)), result.undo);
      },
    );
  }

  function offerUndo(message: string, undo: SeasonUndo) {
    toast(message, {
      id: toastId,
      description: undefined,
      duration: UNDO_TOAST_MS,
      action: {
        label: UNDO_ACTION_LABEL,
        onClick: (event) => undoWrite(event, message, undo),
      },
    });
  }

  /**
   * Sonner deletes a toast once its action runs, and an outcome that lands
   * during the exit animation vanishes with it (spec 0008). So the click keeps
   * the toast, takes the Undo off it so it cannot run twice, and the outcome
   * then closes it or rewrites it in place.
   */
  function undoWrite(
    event: { preventDefault: () => void },
    message: string,
    undo: SeasonUndo,
  ) {
    event.preventDefault();
    toast(message, { id: toastId, action: undefined });
    run(
      [undoIntent(undo)],
      () => undoSeasonWatched(showId, undo),
      (result) => {
        if (result.ok) {
          toast.dismiss(toastId);
          return;
        }
        fail(result.error, toastId);
      },
    );
  }

  const name = `Mark ${seasonName} watched`;

  if (summary.state === "none_aired") {
    return (
      <div data-slot="season-tracking" className="flex flex-wrap gap-3 pt-1">
        <button
          type="button"
          aria-label={`${name}: nothing aired yet`}
          aria-disabled="true"
          className={cn(
            glassPillClassName(),
            PILL,
            "cursor-not-allowed text-text-secondary opacity-60",
          )}
        >
          <WatchedIcon filled={false} />
          <span aria-hidden="true">Nothing aired yet</span>
        </button>
      </div>
    );
  }

  const watched = summary.state === "season_watched";
  return (
    <div
      data-slot="season-tracking"
      className="flex flex-wrap items-center gap-3 pt-1"
    >
      <button
        type="button"
        aria-label={name}
        aria-pressed={watched}
        onClick={watched ? unmark : mark}
        className={cn(
          glassPillClassName(),
          PILL,
          "cursor-pointer transition-[filter] hover:brightness-125",
        )}
      >
        <WatchedIcon filled={watched} />
        <span aria-hidden="true">
          {watched ? "Season watched" : "Mark season watched"}
        </span>
      </button>
      <p className="text-sm text-text-secondary">
        {summary.watchedAired} of {summary.aired} watched
      </p>
    </div>
  );
}

/** How many episodes an Undo would change: the toast's `n`. */
function countOf(undo: SeasonUndo): number {
  return undo.kind === "unmark" ? undo.episodeIds.length : undo.entries.length;
}

/** The optimistic guess for an Undo: the reverse of the write it takes back. */
function undoIntent(undo: SeasonUndo): EpisodeIntent {
  return undo.kind === "unmark"
    ? { kind: "season_unmark", episodeIds: undo.episodeIds }
    : {
        kind: "season_mark",
        episodeIds: undo.entries.map((entry) => entry.episodeId),
      };
}

export { SeasonWatchedControl };
