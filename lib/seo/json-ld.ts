import type { TmdbShowStatus } from "@/lib/tmdb/types";
import { isFinishedShowStatus } from "@/lib/tv/auto-completion";

import { absoluteUrl } from "./site";

/** Cast members a movie's JSON-LD lists (spec 0016, AC-21). */
const ACTOR_LIMIT = 10;

/**
 * The movie fields the structured data reads. Structural, so this module stays
 * free of the TMDB module at runtime: the page passes its normalized `Movie`.
 */
export type MovieJsonLdInput = {
  id: number;
  title: string;
  posterUrl: string | null;
  releaseDate: string | null;
  overview: string | null;
  genres: { name: string }[];
  runtimeMinutes: number | null;
  cast: { name: string; order: number }[];
};

/** As `MovieJsonLdInput`, for a show's normalized `TvShow`. */
export type ShowJsonLdInput = {
  id: number;
  name: string;
  posterUrl: string | null;
  firstAirDate: string | null;
  lastAirDate: string | null;
  status: TmdbShowStatus;
  overview: string | null;
  genres: { name: string }[];
  numberOfSeasons: number;
  numberOfEpisodes: number;
};

type JsonLd = Record<string, unknown>;

/**
 * A schema.org `Movie` for a found movie page (spec 0016, AC-21).
 *
 * A field whose source is null, empty or zero is left out rather than filled
 * with a placeholder (`AGENTS.md` sections 3 and 14). No rating of any kind is
 * emitted: TMDB's community rating stays labelled on the page and personal
 * ratings are private.
 */
export function movieJsonLd(movie: MovieJsonLdInput): JsonLd {
  const actors = [...movie.cast]
    .sort((a, b) => a.order - b.order)
    .slice(0, ACTOR_LIMIT)
    .map(({ name }) => ({ "@type": "Person", name }));

  return withoutEmpty({
    "@context": "https://schema.org",
    "@type": "Movie",
    name: movie.title,
    url: absoluteUrl(`/movies/${movie.id}`),
    image: movie.posterUrl,
    datePublished: movie.releaseDate,
    description: movie.overview,
    genre: movie.genres.map(({ name }) => name),
    duration: movie.runtimeMinutes ? `PT${movie.runtimeMinutes}M` : null,
    actor: actors,
  });
}

/**
 * A schema.org `TVSeries` for a found show page (spec 0016, AC-22), under the
 * same omission rule as `movieJsonLd`. `endDate` is only claimed when TMDB
 * says the show ended or was canceled, the same test automatic completion
 * uses, so a running show's latest episode is never presented as its end.
 */
export function showJsonLd(show: ShowJsonLdInput): JsonLd {
  return withoutEmpty({
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: show.name,
    url: absoluteUrl(`/shows/${show.id}`),
    image: show.posterUrl,
    startDate: show.firstAirDate,
    endDate: isFinishedShowStatus(show.status) ? show.lastAirDate : null,
    description: show.overview,
    genre: show.genres.map(({ name }) => name),
    numberOfSeasons: show.numberOfSeasons,
    numberOfEpisodes: show.numberOfEpisodes,
  });
}

/**
 * Serializes JSON-LD for a `<script type="application/ld+json">` body
 * (spec 0016, AC-23).
 *
 * TMDB text is third party input. Escaping every `<` keeps an overview that
 * contains a closing script tag from ending the tag early, and escaping U+2028
 * and U+2029 keeps the body valid JavaScript. Both escapes are still the same
 * characters to a JSON parser, so the data is unchanged.
 */
export function jsonLdScript(data: JsonLd): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Drops null, empty string, zero and empty array values. */
function withoutEmpty(data: JsonLd): JsonLd {
  return Object.fromEntries(
    Object.entries(data).filter(
      ([, value]) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        value !== 0 &&
        !(Array.isArray(value) && value.length === 0),
    ),
  );
}
