import { imageUrl, PROVIDER_LOGO_SIZE } from "./images";
import { normalizeMovieSummary, normalizeTvSummary } from "./normalize";
import {
  contentRatingSchema,
  movieListItemSchema,
  type RawMovieExtras,
  type RawTvExtras,
  regionProvidersSchema,
  releaseDatesCountrySchema,
  tvListItemSchema,
  videoSchema,
  watchProviderSchema,
} from "./schemas";
import type {
  MovieExtras,
  MovieSummary,
  Paged,
  Provider,
  RegionProviders,
  Trailer,
  TvExtras,
  TvShowSummary,
} from "./types";

/**
 * The appended extras of a title page turned into the app's shapes
 * (spec 0022, AC-11 to AC-14).
 *
 * Every rule that picks one value out of many (the trailer, a provider's
 * group, a country's certification) runs here, once per cached read, and for
 * every country at once. The page only reads its visitor's entry after the
 * cache returns, so nothing request specific enters the cached value
 * (AC-9). Missing stays missing: an empty group, an empty certification or an
 * unusable video is left out, never filled.
 */

/** A YouTube key the embed URL can carry safely (AC-11). */
const YOUTUBE_KEY = /^[A-Za-z0-9_-]{6,20}$/;

/**
 * The one trailer a title page offers (AC-11): a YouTube `Trailer`, else a
 * YouTube `Teaser`; within the type, an official video first, then the newest
 * `published_at`. A video with an unusable key is dropped before choosing, so
 * a bad key never hides a good one; with none left there is no trailer.
 */
export function pickTrailer(
  items: unknown[] | null | undefined,
): Trailer | null {
  const videos = [];
  for (const item of items ?? []) {
    const parsed = videoSchema.safeParse(item);
    if (!parsed.success) continue;
    const video = parsed.data;
    if (video.site !== "YouTube" || !YOUTUBE_KEY.test(video.key)) continue;
    videos.push(video);
  }

  for (const type of ["Trailer", "Teaser"]) {
    const candidates = videos
      .filter((video) => video.type === type)
      .sort(
        (a, b) =>
          Number(b.official === true) - Number(a.official === true) ||
          publishedAt(b.published_at) - publishedAt(a.published_at),
      );
    const chosen = candidates[0];
    if (chosen !== undefined) {
      return { key: chosen.key, name: chosen.name?.trim() || type };
    }
  }
  return null;
}

/** `Date.parse` of `published_at`; a missing or unreadable date sorts oldest. */
function publishedAt(value: string | null | undefined): number {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * One group's providers, merged in the order given by provider id (the first
 * entry wins), then ordered by `display_priority` and name (AC-12). A
 * provider with no priority sorts after those with one.
 */
function providerGroup(...lists: (unknown[] | null | undefined)[]): Provider[] {
  const byId = new Map<number, Provider & { priority: number }>();
  for (const list of lists) {
    for (const item of list ?? []) {
      const parsed = watchProviderSchema.safeParse(item);
      if (!parsed.success) continue;
      const provider = parsed.data;
      const name = provider.provider_name.trim();
      if (name === "" || byId.has(provider.provider_id)) continue;
      byId.set(provider.provider_id, {
        id: provider.provider_id,
        name,
        logoUrl: imageUrl(provider.logo_path, PROVIDER_LOGO_SIZE),
        priority: provider.display_priority ?? Number.POSITIVE_INFINITY,
      });
    }
  }
  return [...byId.values()]
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
    .map(({ priority: _, ...provider }) => provider);
}

/**
 * Every country's providers, grouped into Stream, Free and Rent or buy
 * (AC-12). A country whose entry does not parse is dropped; a country with
 * no provider in any group is kept with empty groups, so the page can still
 * link to TMDB's watch page there.
 */
export function normalizeWatchProviders(
  results: Record<string, unknown> | null | undefined,
): Record<string, RegionProviders> {
  const regions: Record<string, RegionProviders> = {};
  for (const [code, entry] of Object.entries(results ?? {})) {
    const parsed = regionProvidersSchema.safeParse(entry);
    if (!parsed.success) continue;
    const region = parsed.data;
    regions[code] = {
      link: region.link?.trim() || null,
      stream: providerGroup(region.flatrate),
      free: providerGroup(region.free, region.ads),
      rentOrBuy: providerGroup(region.rent, region.buy),
    };
  }
  return regions;
}

/** TMDB's release type for a theatrical release (AC-13). */
const THEATRICAL = 3;

/**
 * A movie's certification per country (AC-13): the non empty certification
 * of the theatrical release, else the first non empty one in TMDB's array
 * order. A country with none is left out, so the page never borrows another
 * country's rating.
 */
export function movieAgeRatings(
  items: unknown[] | null | undefined,
): Record<string, string> {
  const ratings: Record<string, string> = {};
  for (const item of items ?? []) {
    const parsed = releaseDatesCountrySchema.safeParse(item);
    if (!parsed.success) continue;
    const dates = parsed.data.release_dates.map((date) => ({
      type: date.type,
      certification: date.certification?.trim() ?? "",
    }));
    const chosen =
      dates.find((date) => date.type === THEATRICAL && date.certification) ??
      dates.find((date) => date.certification);
    if (chosen) ratings[parsed.data.iso_3166_1] = chosen.certification;
  }
  return ratings;
}

/** A show's `content_ratings` per country, empty ratings left out (AC-13). */
export function showAgeRatings(
  items: unknown[] | null | undefined,
): Record<string, string> {
  const ratings: Record<string, string> = {};
  for (const item of items ?? []) {
    const parsed = contentRatingSchema.safeParse(item);
    if (!parsed.success) continue;
    const rating = parsed.data.rating?.trim();
    if (rating) ratings[parsed.data.iso_3166_1] = rating;
  }
  return ratings;
}

type RawRecommendations = RawMovieExtras["recommendations"];

/**
 * Page 1 of recommendations through the list item schemas, so an adult
 * title is dropped exactly as on the spec 0021 lists (AC-14), along with any
 * malformed result. The totals pass through; a missing envelope is an empty
 * page.
 */
function recommendationsPage<Summary>(
  raw: RawRecommendations,
  parse: (item: unknown) => Summary | null,
): Paged<Summary> {
  const results: Summary[] = [];
  for (const item of raw?.results ?? []) {
    const summary = parse(item);
    if (summary !== null) results.push(summary);
  }
  return {
    page: raw?.page ?? 1,
    results,
    totalPages: raw?.total_pages ?? 0,
    totalResults: raw?.total_results ?? 0,
  };
}

function movieRecommendation(item: unknown): MovieSummary | null {
  const parsed = movieListItemSchema.safeParse(item);
  if (!parsed.success || parsed.data.adult === true) return null;
  return normalizeMovieSummary(parsed.data);
}

function tvRecommendation(item: unknown): TvShowSummary | null {
  const parsed = tvListItemSchema.safeParse(item);
  if (!parsed.success || parsed.data.adult === true) return null;
  return normalizeTvSummary(parsed.data);
}

/** A movie's extras, every country at once (AC-8). */
export function normalizeMovieExtras(raw: RawMovieExtras): MovieExtras {
  return {
    trailer: pickTrailer(raw.videos?.results),
    recommendations: {
      mediaType: "movie",
      paged: recommendationsPage(raw.recommendations, movieRecommendation),
    },
    watchProviders: normalizeWatchProviders(raw["watch/providers"]?.results),
    ageRatings: movieAgeRatings(raw.release_dates?.results),
  };
}

/** A show's extras, every country at once (AC-8). */
export function normalizeTvExtras(raw: RawTvExtras): TvExtras {
  return {
    trailer: pickTrailer(raw.videos?.results),
    recommendations: {
      mediaType: "tv",
      paged: recommendationsPage(raw.recommendations, tvRecommendation),
    },
    watchProviders: normalizeWatchProviders(raw["watch/providers"]?.results),
    ageRatings: showAgeRatings(raw.content_ratings?.results),
  };
}
