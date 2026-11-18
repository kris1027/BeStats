import { EMPTY_EPISODE_TRACKING, type EpisodeTrackingState } from "./types";

/**
 * One click on a season page, as the target value it asks for (spec 0011,
 * API surface). Target values rather than toggles, so a queued repeat lands on
 * the same state (AC-16).
 */
export type EpisodeIntent =
  | { kind: "watched"; episodeId: number; value: boolean }
  | { kind: "rating"; episodeId: number; value: number | null }
  /** Mark season watched, and the Undo of an unmark: these ids become watched. */
  | { kind: "season_mark"; episodeIds: readonly number[] }
  /** Unmark season, and the Undo of a mark: these ids become unwatched. */
  | { kind: "season_unmark"; episodeIds: readonly number[] };

/** The stored states of one season, by episode id. A missing id is empty. */
export type EpisodeStates = Readonly<Record<number, EpisodeTrackingState>>;

/**
 * The states a click produces, applied on top of the last states the server
 * confirmed.
 *
 * It mirrors the five functions in `supabase/schemas/05-functions.sql`,
 * because a guess that disagrees with the database flips a row twice: once on
 * the click and again when `refresh()` delivers the truth. The one coupling is
 * that rating an unwatched episode also marks it watched (AC-6). Unwatching,
 * clearing a rating and every season write leave the other field alone
 * (`AGENTS.md` section 7).
 *
 * @param states The states to build on: the server's, or an earlier guess.
 * @param intent The click.
 * @returns A new map; the input is never changed.
 */
export function applyEpisodeIntent(
  states: EpisodeStates,
  intent: EpisodeIntent,
): EpisodeStates {
  switch (intent.kind) {
    case "watched":
      return withState(states, intent.episodeId, (state) => ({
        ...state,
        watched: intent.value,
      }));
    case "rating":
      return withState(states, intent.episodeId, (state) =>
        intent.value === null
          ? { ...state, rating: null }
          : { watched: true, rating: intent.value },
      );
    case "season_mark": {
      // One copy per intent, not per id: a season can hold hundreds of ids and
      // every row replays the pending intents on each render.
      const next: Record<number, EpisodeTrackingState> = { ...states };
      for (const id of intent.episodeIds) {
        next[id] = { ...(next[id] ?? EMPTY_EPISODE_TRACKING), watched: true };
      }
      return next;
    }
    case "season_unmark": {
      const next: Record<number, EpisodeTrackingState> = { ...states };
      for (const id of intent.episodeIds) {
        // Removals never create a row, so an id with no state stays absent.
        if (id in next) next[id] = { ...next[id], watched: false };
      }
      return next;
    }
  }
}

function withState(
  states: EpisodeStates,
  id: number,
  change: (state: EpisodeTrackingState) => EpisodeTrackingState,
): EpisodeStates {
  return { ...states, [id]: change(states[id] ?? EMPTY_EPISODE_TRACKING) };
}

/**
 * The confirmed states with every pending click replayed on top, in order.
 *
 * @param confirmed What the server last delivered.
 * @param pending The clicks still in flight, oldest first.
 */
export function applyEpisodeIntents(
  confirmed: EpisodeStates,
  pending: readonly EpisodeIntent[],
): EpisodeStates {
  return pending.reduce(applyEpisodeIntent, confirmed);
}
