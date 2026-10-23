import "server-only";

import { type Game, getGame, IgdbError, isIgdbNotFound } from "@/lib/igdb";

export type LoadGameResult =
  | { kind: "found"; game: Game }
  | { kind: "not_found" }
  | { kind: "failed" };

/**
 * The one place the game page decides whether it has a game to show
 * (spec 0025, AC-7, AC-8, AC-10).
 *
 * The page body and `generateMetadata` both branch on this, so the tab title
 * and the panel can never disagree about whether the game exists. Both calls
 * read the same cached `getGame` entry.
 *
 * A game IGDB returns with `hidden: true` (DLC, a bundle, an edition, the
 * Erotic theme) is reported as not found: the catalog filter exists to keep
 * those out of browsing, the way an adult movie is (spec 0025, rationale).
 *
 * Only an `IgdbError` becomes `failed`. Anything else, `IgdbValidationError`
 * included, is a bug rather than an IGDB outcome, so it is rethrown instead
 * of being dressed up as "Couldn't reach IGDB" (AC-8).
 */
export async function loadGame(id: number): Promise<LoadGameResult> {
  try {
    const game = await getGame(id);
    return game.hidden ? { kind: "not_found" } : { kind: "found", game };
  } catch (error) {
    if (isIgdbNotFound(error)) return { kind: "not_found" };
    if (error instanceof IgdbError) return { kind: "failed" };
    throw error;
  }
}
