import { SHOW_CAST_LIMIT } from "./constants";
import {
  BACKDROP_SIZE,
  imageUrl,
  POSTER_SIZE,
  PROFILE_SIZE,
  STILL_SIZE,
} from "./images";
import {
  aggregateCastMemberSchema,
  castMemberSchema,
  type RawEpisode,
  type RawMovie,
  type RawMovieSummary,
  type RawSeasonDetail,
  type RawSeasonSummary,
  type RawTvShow,
  type RawTvSummary,
  translationSchema,
} from "./schemas";
import type {
  CastMember,
  Episode,
  Genre,
  Movie,
  MovieSummary,
  SeasonDetail,
  SeasonSummary,
  ShowCastMember,
  TvShow,
  TvShowSummary,
} from "./types";

/**
 * TMDB's shapes turned into the app's own.
 *
 * Every helper here obeys one rule: missing stays missing (spec 0002, AC-13).
 * Nothing is filled with zero, an empty string, today's date or placeholder
 * copy, because a page that shows an invented value is worse than a page that
 * says the value is not available.
 */

/** An empty string from TMDB means "nothing here", so it becomes null. */
function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * TMDB reports "no rating yet" as `0`, not as an absent field. Passing that
 * through would put a 0/10 on a page nobody has rated, so zero becomes null.
 */
function ratingOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && value > 0 ? value : null;
}

/** A runtime of 0 means TMDB does not know it, same reasoning as the rating. */
function runtimeOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && value > 0 ? value : null;
}

/**
 * The year of a TMDB date string.
 *
 * Deliberately the leading four characters rather than a `Date` parse: TMDB
 * supplies a plain `YYYY-MM-DD` with no time and no zone, and parsing it would
 * invent a moment that can land on the previous year west of UTC.
 */
export function yearFromDate(date: string | null): number | null {
  if (!date || date.length < 4) return null;
  const year = Number(date.slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

function normalizeGenres(
  genres: { id: number; name: string }[] | null | undefined,
): Genre[] {
  return (genres ?? []).map((genre) => ({ id: genre.id, name: genre.name }));
}

/**
 * Turns TMDB's credits into cast members, dropping any entry that does not
 * parse.
 *
 * Dropping rather than raising is the deliberate choice of spec 0002's AC-9: a
 * single malformed credit must not blank a whole movie page. Ordering follows
 * TMDB's own `order` so the billed cast stays in billing order.
 */
export function normalizeCast(
  items: unknown[] | null | undefined,
): CastMember[] {
  const cast: CastMember[] = [];
  for (const [index, item] of (items ?? []).entries()) {
    const parsed = castMemberSchema.safeParse(item);
    if (!parsed.success) continue;
    cast.push({
      personId: parsed.data.id,
      // TMDB always sends one today; the position keeps the key unique if not.
      creditId: parsed.data.credit_id ?? `${parsed.data.id}-${index}`,
      name: parsed.data.name,
      character: parsed.data.character ?? "",
      profileUrl: imageUrl(parsed.data.profile_path, PROFILE_SIZE),
      order: parsed.data.order ?? Number.MAX_SAFE_INTEGER,
    });
  }
  return cast.sort((a, b) => a.order - b.order);
}

export function normalizeMovieSummary(raw: RawMovieSummary): MovieSummary {
  const releaseDate = textOrNull(raw.release_date);
  return {
    id: raw.id,
    title: raw.title,
    posterUrl: imageUrl(raw.poster_path, POSTER_SIZE),
    releaseDate,
    releaseYear: yearFromDate(releaseDate),
    overview: textOrNull(raw.overview),
    tmdbRating: ratingOrNull(raw.vote_average),
    tmdbVoteCount: raw.vote_count ?? 0,
    genreIds: raw.genre_ids ?? [],
  };
}

/**
 * The overview a movie page shows, and the language it is written in.
 *
 * English first, because the product is in English (AGENTS.md section 3). When
 * TMDB has no English overview, the original language is the one translation
 * that is authored rather than translated, so it is the honest fallback; any
 * other language would be a guess. The first matching entry wins, which keeps
 * the choice stable across reads. A translation that does not parse is dropped,
 * the same rule as a malformed credit (spec 0006, AC-5).
 */
export function resolveOverview(
  englishOverview: string | null | undefined,
  originalLanguage: string,
  translations: unknown[] | null | undefined,
): { overview: string | null; overviewLanguage: string | null } {
  const english = textOrNull(englishOverview);
  if (english) return { overview: english, overviewLanguage: "en" };

  for (const item of translations ?? []) {
    const parsed = translationSchema.safeParse(item);
    if (!parsed.success) continue;
    if (parsed.data.iso_639_1 !== originalLanguage) continue;
    const overview = textOrNull(parsed.data.data?.overview);
    if (overview) return { overview, overviewLanguage: originalLanguage };
  }

  return { overview: null, overviewLanguage: null };
}

export function normalizeMovie(raw: RawMovie): Movie {
  return {
    ...normalizeMovieSummary(raw),
    ...resolveOverview(
      raw.overview,
      raw.original_language,
      raw.translations?.translations,
    ),
    adult: raw.adult ?? false,
    backdropUrl: imageUrl(raw.backdrop_path, BACKDROP_SIZE),
    originalTitle: raw.original_title,
    originalLanguage: raw.original_language,
    tagline: textOrNull(raw.tagline),
    runtimeMinutes: runtimeOrNull(raw.runtime),
    genres: normalizeGenres(raw.genres),
    // A detail payload has `genres` and no `genre_ids`, so the ids come from
    // the list the page shows rather than staying empty.
    genreIds: normalizeGenres(raw.genres).map((genre) => genre.id),
    cast: normalizeCast(raw.credits?.cast),
  };
}

export function normalizeTvSummary(raw: RawTvSummary): TvShowSummary {
  const firstAirDate = textOrNull(raw.first_air_date);
  return {
    id: raw.id,
    name: raw.name,
    posterUrl: imageUrl(raw.poster_path, POSTER_SIZE),
    firstAirDate,
    firstAirYear: yearFromDate(firstAirDate),
    overview: textOrNull(raw.overview),
    tmdbRating: ratingOrNull(raw.vote_average),
    tmdbVoteCount: raw.vote_count ?? 0,
    genreIds: raw.genre_ids ?? [],
  };
}

/** Season 0 is TMDB's specials bucket; the flag is derived, never sent. */
export function normalizeSeasonSummary(raw: RawSeasonSummary): SeasonSummary {
  return {
    seasonNumber: raw.season_number,
    name: textOrNull(raw.name) ?? `Season ${raw.season_number}`,
    episodeCount: raw.episode_count ?? 0,
    airDate: textOrNull(raw.air_date),
    posterUrl: imageUrl(raw.poster_path, POSTER_SIZE),
    isSpecials: raw.season_number === 0,
  };
}

export function normalizeTvShow(raw: RawTvShow): TvShow {
  const lastAirDate = textOrNull(raw.last_air_date);
  return {
    ...normalizeTvSummary(raw),
    ...resolveOverview(
      raw.overview,
      raw.original_language,
      raw.translations?.translations,
    ),
    adult: raw.adult ?? false,
    originalLanguage: raw.original_language,
    tagline: textOrNull(raw.tagline),
    backdropUrl: imageUrl(raw.backdrop_path, BACKDROP_SIZE),
    // Reported verbatim. What `Ended` or `Canceled` means for automatic
    // completion belongs to scope feature 16, not to this module.
    status: raw.status ?? "",
    inProduction: raw.in_production ?? false,
    lastAirDate,
    lastAirYear: yearFromDate(lastAirDate),
    numberOfSeasons: raw.number_of_seasons ?? 0,
    numberOfEpisodes: raw.number_of_episodes ?? 0,
    genres: normalizeGenres(raw.genres),
    genreIds: normalizeGenres(raw.genres).map((genre) => genre.id),
    seasons: (raw.seasons ?? []).map(normalizeSeasonSummary),
  };
}

/**
 * A show's series cast from TMDB's aggregate credits (spec 0009, AC-8).
 *
 * A person who played several roles is shown once, with the role they played
 * in the most episodes (the first listed on a tie), because that is the part a
 * viewer knows them for. People are sorted by total episode count, then by
 * TMDB's own `order`: TMDB already returns them that way, but the explicit sort
 * keeps the rule ours if TMDB ever changes its ordering. The result is cut to
 * `SHOW_CAST_LIMIT` here rather than on the page, so the cached value stays
 * small even when TMDB lists hundreds of people. A malformed person, or one
 * with no role, is dropped, the same rule as a malformed movie credit.
 */
export function normalizeShowCast(
  items: unknown[] | null | undefined,
): ShowCastMember[] {
  const people: (ShowCastMember & { totalEpisodes: number })[] = [];
  for (const item of items ?? []) {
    const parsed = aggregateCastMemberSchema.safeParse(item);
    if (!parsed.success) continue;
    const person = parsed.data;

    let role = person.roles[0];
    if (role === undefined) continue;
    for (const candidate of person.roles) {
      if ((candidate.episode_count ?? 0) > (role.episode_count ?? 0)) {
        role = candidate;
      }
    }

    people.push({
      personId: person.id,
      creditId: role.credit_id,
      name: person.name,
      character: role.character ?? "",
      profileUrl: imageUrl(person.profile_path, PROFILE_SIZE),
      // A missing order sorts last; the stable sort keeps TMDB's list order.
      order: person.order ?? Number.MAX_SAFE_INTEGER,
      totalEpisodes: person.total_episode_count ?? 0,
    });
  }

  return people
    .sort((a, b) => b.totalEpisodes - a.totalEpisodes || a.order - b.order)
    .slice(0, SHOW_CAST_LIMIT)
    .map(({ totalEpisodes: _, ...member }) => member);
}

/**
 * @param showId Injected from the caller's argument, because TMDB's season
 * payload does not repeat it and `user_episode_state` in spec 0001 stores it.
 */
export function normalizeEpisode(raw: RawEpisode, showId: number): Episode {
  return {
    id: raw.id,
    showId,
    seasonNumber: raw.season_number,
    episodeNumber: raw.episode_number,
    name: textOrNull(raw.name),
    overview: textOrNull(raw.overview),
    // Passed through untouched. Null means TMDB has no confirmed date, which is
    // a different fact from "unaired" and is not this module's to decide.
    airDate: textOrNull(raw.air_date),
    stillUrl: imageUrl(raw.still_path, STILL_SIZE),
    runtimeMinutes: runtimeOrNull(raw.runtime),
    tmdbRating: ratingOrNull(raw.vote_average),
  };
}

export function normalizeSeasonDetail(
  raw: RawSeasonDetail,
  showId: number,
): SeasonDetail {
  return {
    seasonNumber: raw.season_number,
    name: textOrNull(raw.name) ?? `Season ${raw.season_number}`,
    overview: textOrNull(raw.overview),
    airDate: textOrNull(raw.air_date),
    posterUrl: imageUrl(raw.poster_path, POSTER_SIZE),
    episodes: raw.episodes.map((episode) => normalizeEpisode(episode, showId)),
  };
}
