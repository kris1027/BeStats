import type { LibraryList } from "@/lib/catalog/library-list";
import type { EpisodeToAir, SeasonSummary, TmdbShowStatus } from "@/lib/tmdb";

import { airStatus } from "./air-status";

/** A regular episode's place: season 1 or later, episode 1 or later. */
export type EpisodePlace = { season: number; episode: number };

/** What `classifyShow` reads from one `getTvShow` result. */
export type ShowDetails = {
  seasons: readonly Pick<
    SeasonSummary,
    "seasonNumber" | "episodeCount" | "airDate"
  >[];
  lastEpisodeToAir: EpisodeToAir | null;
  nextEpisodeToAir: EpisodeToAir | null;
  status: TmdbShowStatus;
};

/**
 * The one library page a tracked show sits on (spec 0020,
 * AC-7), with what its card shows there.
 */
export type ShowPage =
  | { page: Extract<LibraryList, "watchlist">; next: EpisodePlace }
  | {
      page: Extract<LibraryList, "upcoming">;
      airDate: string | null;
      next: EpisodePlace | null;
    }
  | {
      page: Extract<LibraryList, "watched">;
      label: "finished" | "caught_up";
    };

/**
 * Whether TMDB says the show has ended or been canceled, the Watched card's
 * Finished label (spec 0020, AC-12) and the JSON-LD end date. Exact match on
 * TMDB's own wording: `Returning Series`, `In Production`, `Planned`, `Pilot`
 * and a missing status all read as ongoing.
 *
 * @param status `TvShow.status`.
 */
export function isFinishedShowStatus(status: TmdbShowStatus): boolean {
  return status === "Ended" || status === "Canceled";
}

/**
 * A regular episode in the watched set. Branded so only `episodeKey` makes
 * one: a `Set` compares objects by identity, so an `EpisodePlace` cannot be
 * its member, and a stray string would silently never match.
 */
export type EpisodeKey = string & { readonly __brand: "EpisodeKey" };

/** The key of a regular episode in the watched set. */
export function episodeKey(season: number, episode: number): EpisodeKey {
  return `${season}:${episode}` as EpisodeKey;
}

/**
 * Which library page a tracked show belongs on (spec 0020,
 * AC-7, AC-8). Pure: the same TMDB details, watched set and day always give
 * the same page, and nothing it decides is stored (key invariants).
 *
 * The aired episodes are worked out from the show details alone, with no
 * season reads: every regular episode up to `last_episode_to_air`, in season
 * then episode order, plus everything up to a `next_episode_to_air` dated on
 * or before today (TMDB moves that field a few hours after the episode
 * airs). Each season contributes episodes 1 to its `episode_count`, and the
 * boundary season up to the boundary episode even when the count lags behind
 * it or the season is missing from the list (cache skew), because TMDB itself
 * says that episode aired. A season with no count contributes nothing.
 *
 * When `last_episode_to_air` is a special, it says nothing about the regular
 * seasons, so a regular season counts as aired when its own air date is on
 * or before today. If that leaves a regular season whose airing is unknown
 * (no date) and no aired episode at all, the source cannot show the user is
 * caught up, so the show never goes on Watched (AC-7). It goes on Watchlist
 * at its first unwatched episode when that sorts before a dated
 * `next_episode_to_air`, so Mark watched is never offered for an episode
 * still to come; on Upcoming at that dated episode otherwise; and on
 * Upcoming as Date TBA when every listed episode is already watched.
 *
 * Specials never count: the watched set holds regular episodes only, and a
 * special `next_episode_to_air` is ignored. Want to Watch and Completed are
 * gone; a show with nothing aired and nothing watched waits on Upcoming.
 *
 * @param details The show's `getTvShow` read.
 * @param watched The user's watched regular episodes, as `episodeKey`s.
 * @param today `requestTodayUtc()`, read once per request (AC-22).
 */
export function classifyShow(
  details: ShowDetails,
  watched: ReadonlySet<EpisodeKey>,
  today: string,
): ShowPage {
  const seasons = regularSeasons(details.seasons);
  const last = details.lastEpisodeToAir;
  const next = regularOrNull(details.nextEpisodeToAir);
  const nextAired = next !== null && airStatus(next.airDate, today) === "aired";

  // The boundary every aired episode sorts at or before.
  let boundary: EpisodePlace | null = null;
  if (last !== null && last.seasonNumber >= 1) boundary = placeOf(last);
  if (nextAired && next !== null) boundary = later(boundary, placeOf(next));

  // A special as the last aired episode: fall back to the seasons' own dates.
  const fallback = last !== null && last.seasonNumber === 0;
  const airedSeasons = fallback
    ? new Set(
        seasons
          .filter((season) => airStatus(season.airDate, today) === "aired")
          .map((season) => season.seasonNumber),
      )
    : new Set<number>();

  let anyAired = false;
  for (const place of airedPlaces(seasons, boundary, airedSeasons)) {
    anyAired = true;
    if (!watched.has(episodeKey(place.season, place.episode))) {
      return { page: "watchlist", next: place };
    }
  }

  const dated =
    next !== null && airStatus(next.airDate, today) === "upcoming"
      ? next
      : null;

  const unknown = seasons.some(
    (season) => airStatus(season.airDate, today) === "unknown",
  );
  if (fallback && !anyAired && unknown) {
    const first = firstUnwatched(seasons, watched);
    if (first !== null && (dated === null || before(first, placeOf(dated)))) {
      return { page: "watchlist", next: first };
    }
    if (dated === null) return { page: "upcoming", airDate: null, next: null };
  }

  if (dated !== null) {
    return { page: "upcoming", airDate: dated.airDate, next: placeOf(dated) };
  }

  if (watched.size === 0) {
    return { page: "upcoming", airDate: null, next: next && placeOf(next) };
  }

  return {
    page: "watched",
    label: isFinishedShowStatus(details.status) ? "finished" : "caught_up",
  };
}

type RegularSeason = {
  seasonNumber: number;
  episodeCount: number;
  airDate: string | null;
};

/** Regular seasons in season order. A season with no episodes is skipped. */
function regularSeasons(seasons: ShowDetails["seasons"]): RegularSeason[] {
  return seasons
    .filter((season) => season.seasonNumber >= 1 && season.episodeCount > 0)
    .map((season) => ({
      seasonNumber: season.seasonNumber,
      episodeCount: season.episodeCount,
      airDate: season.airDate,
    }))
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
}

/**
 * Every aired episode, in season then episode order: the ones at or before
 * `boundary`, and every episode of a season in `airedSeasons`. The boundary
 * season is walked to the boundary episode even when the list lacks it.
 */
function* airedPlaces(
  seasons: readonly RegularSeason[],
  boundary: EpisodePlace | null,
  airedSeasons: ReadonlySet<number>,
): Generator<EpisodePlace> {
  const counts = new Map(
    seasons.map((season) => [season.seasonNumber, season.episodeCount]),
  );
  if (boundary !== null && !counts.has(boundary.season)) {
    counts.set(boundary.season, boundary.episode);
  }

  for (const season of [...counts.keys()].sort((a, b) => a - b)) {
    const count = counts.get(season) ?? 0;
    let last = 0;
    if (airedSeasons.has(season)) last = count;
    if (boundary !== null) {
      if (season < boundary.season) last = count;
      else if (season === boundary.season) {
        last = Math.max(last, boundary.episode);
      }
    }
    for (let episode = 1; episode <= last; episode++) {
      yield { season, episode };
    }
  }
}

function firstUnwatched(
  seasons: readonly RegularSeason[],
  watched: ReadonlySet<EpisodeKey>,
): EpisodePlace | null {
  for (const season of seasons) {
    for (let episode = 1; episode <= season.episodeCount; episode++) {
      if (!watched.has(episodeKey(season.seasonNumber, episode))) {
        return { season: season.seasonNumber, episode };
      }
    }
  }
  return null;
}

function regularOrNull(episode: EpisodeToAir | null): EpisodeToAir | null {
  return episode !== null && episode.seasonNumber >= 1 ? episode : null;
}

function placeOf(episode: EpisodeToAir): EpisodePlace {
  return { season: episode.seasonNumber, episode: episode.episodeNumber };
}

function before(a: EpisodePlace, b: EpisodePlace): boolean {
  return a.season !== b.season ? a.season < b.season : a.episode < b.episode;
}

function later(a: EpisodePlace | null, b: EpisodePlace): EpisodePlace {
  if (a === null) return b;
  if (b.season !== a.season) return b.season > a.season ? b : a;
  return b.episode > a.episode ? b : a;
}
