import "server-only";

import {
  V1_MORE_LIKE_THIS_LIMIT,
  type V1TitleExtras,
} from "@bestats/core/api/v1/extras";
import type { Region } from "@bestats/core/catalog/region";
import type { MovieExtras, TvExtras } from "@bestats/core/tmdb/types";

import { itemFromMovie, itemFromShow } from "./browse";

/**
 * A title's cached extras turned into the app's answer for one country
 * (prompts/mobile-look-title-extras.md, decisions 1 and 4). The cached read
 * holds every country; only here, after it returns, is the connection's
 * country picked, exactly as the web's slots do (spec 0022, AC-9), so no
 * request state enters the cache. Missing stays missing: no rating or no
 * providers for that country is null, never another country's.
 */
export function extrasForRegion(
  extras: MovieExtras | TvExtras,
  region: Region,
): V1TitleExtras {
  const recommendations =
    extras.recommendations.mediaType === "movie"
      ? extras.recommendations.paged.results.map(itemFromMovie)
      : extras.recommendations.paged.results.map(itemFromShow);
  return {
    region: { code: region.code, name: region.name },
    trailer: extras.trailer,
    ageRating: extras.ageRatings[region.code] ?? null,
    watch: extras.watchProviders[region.code] ?? null,
    recommendations: recommendations.slice(0, V1_MORE_LIKE_THIS_LIMIT),
  };
}
