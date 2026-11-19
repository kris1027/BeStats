import { z } from "zod";

import {
  episodeMarkUndoInputSchema,
  restoreGameStatusInputSchema,
  restoreRemovedGameInputSchema,
  restoreShowTrackingInputSchema,
  restoreWatchedInputSchema,
  restoreWatchlistInputSchema,
  seasonNumberSchema,
  seasonUndoInputSchema,
} from "../../tracking/schemas";

/**
 * The one Undo contract of `/api/v1` (spec 0035, Undo): what a client posts
 * back to a `…/restore` route, discriminated by `kind`.
 *
 * Each member is exactly the input its restore Server Action already takes
 * (`restoreMovieWatchlist`, `restoreMovieWatched`, `undoEpisodeMark`,
 * `undoSeasonWatched`, `restoreShowTracking`, `restoreGameStatus`,
 * `restoreRemovedGame`) plus its `kind`, built from those very schemas, so the
 * route and the action cannot accept different shapes. The app builds it from
 * the write's own result (`cleared`, `markedAt` or `undo`) and the ids it
 * sent. Every member only ever names the caller's own rows, which RLS bounds
 * (AGENTS.md section 11).
 *
 * The one addition is the season member's `seasonNumber`: the web action's
 * Undo never leaves its page, but a v1 restore route has `{n}` in its path,
 * and the route can only bind the Undo to that season if the state names it.
 */
export const clearedStateSchema = z.discriminatedUnion("kind", [
  restoreWatchlistInputSchema.extend({ kind: z.literal("movie_watchlist") }),
  restoreWatchedInputSchema.extend({ kind: z.literal("movie_watched") }),
  episodeMarkUndoInputSchema.extend({ kind: z.literal("episode") }),
  seasonUndoInputSchema.extend({
    kind: z.literal("season"),
    seasonNumber: seasonNumberSchema,
  }),
  restoreShowTrackingInputSchema.extend({ kind: z.literal("show_tracking") }),
  restoreGameStatusInputSchema.extend({ kind: z.literal("game_status") }),
  restoreRemovedGameInputSchema.extend({ kind: z.literal("game_removed") }),
]);

export type ClearedState = z.infer<typeof clearedStateSchema>;

export type ClearedKind = ClearedState["kind"];

/** One member of the union, by its kind. */
export type ClearedOf<K extends ClearedKind> = Extract<
  ClearedState,
  { kind: K }
>;

/**
 * The body of a restore route that accepts only `kinds`: `{ cleared }` with
 * any other kind refused as 400 `invalid_input` before the handler runs, so a
 * movie Undo can never reach the season restore (spec 0035, Undo).
 */
export function restoreBodySchema<const K extends ClearedKind>(
  ...kinds: [K, ...K[]]
) {
  return z.object({
    cleared: clearedStateSchema
      .refine((state) => (kinds as readonly ClearedKind[]).includes(state.kind))
      .transform((state) => state as ClearedOf<K>),
  });
}
