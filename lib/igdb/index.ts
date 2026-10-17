import "server-only";

/**
 * The public face of the IGDB module, and the only file a page imports from
 * `lib/igdb/` (spec 0023, AC-20).
 *
 * It exports the cached reads, `isIgdbNotFound`, the two error classes and the
 * normalized types, nothing else; `surface.test.ts` fails on any addition. The
 * client, the token, the limiter, the query builder, the schemas and the inner
 * reads stay internal, so no raw IGDB object or `snake_case` field crosses
 * this boundary (AC-15). `server-only` here makes a Client Component import a
 * build failure rather than a leaked credential (AC-2).
 */

export {
  IgdbError,
  type IgdbErrorKind,
  IgdbValidationError,
  isIgdbNotFound,
} from "./errors";
export {
  discoverGames,
  getGame,
  getGameGenres,
  getGamePlatforms,
  getGamesByIds,
  searchGames,
} from "./reads";
export type {
  BatchResult,
  DiscoverGamesOptions,
  DiscoverSort,
  Game,
  GameRef,
  GameSummary,
  GameType,
  Paged,
  SearchGamesOptions,
} from "./types";
