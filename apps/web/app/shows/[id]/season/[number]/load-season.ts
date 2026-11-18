import "server-only";

import {
  getSeason,
  isTmdbNotFound,
  type SeasonDetail,
  TmdbError,
  type TvShow,
} from "@/lib/tmdb";

import { loadShow } from "../../load-show";

export type LoadSeasonResult =
  | { kind: "found"; show: TvShow; season: SeasonDetail }
  | { kind: "show_not_found" }
  | { kind: "season_not_found"; show: TvShow }
  | { kind: "failed" };

/**
 * Whether a season page has a season to show (spec 0009, AC-14, AC-15).
 *
 * The show comes first, through the same `loadShow` as the show page, so an
 * unknown or adult show is not found here too. A season number the show does
 * not list is answered without asking TMDB for it: the show's own season
 * list is the authority, and a request for a season that is not in it can
 * only cost a round trip. A listed season TMDB then answers as not found takes
 * the same branch, which keeps the show so the panel can link back to it.
 */
export async function loadSeason(
  id: number,
  seasonNumber: number,
): Promise<LoadSeasonResult> {
  const shown = await loadShow(id);
  if (shown.kind === "not_found") return { kind: "show_not_found" };
  if (shown.kind === "failed") return { kind: "failed" };

  const { show } = shown;
  if (!show.seasons.some((season) => season.seasonNumber === seasonNumber)) {
    return { kind: "season_not_found", show };
  }

  try {
    const season = await getSeason(id, seasonNumber);
    return { kind: "found", show, season };
  } catch (error) {
    if (isTmdbNotFound(error)) return { kind: "season_not_found", show };
    if (error instanceof TmdbError) return { kind: "failed" };
    throw error;
  }
}
