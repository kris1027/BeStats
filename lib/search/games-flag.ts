import { getGamesLibrary } from "@/lib/env";

/**
 * Whether this request may search games: its raw `type` is `game` and the
 * games library is on (spec 0029, AC-1, AC-17).
 *
 * The flag is read only for a raw `type=game`, so an invalid flag value can
 * never take a show or movie search down. The results, the filter bar and
 * `/api/search` all ask here, so the three cannot drift apart.
 */
export function gameSearchEnabled(rawType: unknown): boolean {
  return rawType === "game" && getGamesLibrary() === "on";
}
