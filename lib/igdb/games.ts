import "server-only";
import { igdbRequest } from "./client";
import { IGDB_GAME_FIELDS } from "./constants";
import { IgdbError } from "./errors";
import { normalizeGame } from "./normalize";
import { buildQuery, cond } from "./query";
import { gameDetailSchema, recordsSchema } from "./schemas";
import type { Game } from "./types";
import { assertGameId } from "./validation";

/**
 * Reads one game by id, in exactly one IGDB request (spec 0023, AC-9).
 *
 * The catalog filter does not refuse a game here: a game that fails it comes
 * back with `hidden: true`. A user's list can hold a game IGDB later
 * reclassified (as a DLC, say), and it must stay visible and removable there
 * instead of vanishing as if it were deleted; the page decides what to show.
 *
 * @throws {IgdbValidationError} When the id is not a positive integer.
 * @throws {IgdbError} `not_found` for an empty answer, `bad_response` when the
 * record lacks an `id` or `name` (nothing partial), or any client kind.
 */
export async function fetchGame(id: number): Promise<Game> {
  const gameId = assertGameId(id);
  const { data } = await igdbRequest(
    "games",
    buildQuery({
      fields: IGDB_GAME_FIELDS,
      where: [cond.is("id", gameId)],
      limit: 1,
    }),
    recordsSchema,
  );

  if (data.length === 0) {
    throw new IgdbError("not_found", "games", `IGDB has no game ${gameId}`);
  }

  const parsed = gameDetailSchema.safeParse(data[0]);
  if (!parsed.success) {
    throw new IgdbError(
      "bad_response",
      "games",
      `IGDB game ${gameId} did not match the expected shape: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`,
    );
  }
  return normalizeGame(parsed.data);
}
