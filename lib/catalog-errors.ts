import { IgdbError } from "@/lib/igdb";
import { TmdbError } from "@/lib/tmdb";

/**
 * True for a failure of a list's own catalog, TMDB's or IGDB's, which a
 * landing section or list page answers with its own Try again (spec 0021,
 * AC-11; spec 0028, AC-11). Anything else, an `IgdbValidationError`
 * included, is a bug the caller rethrows.
 */
export function isCatalogError(error: unknown): boolean {
  return error instanceof TmdbError || error instanceof IgdbError;
}
