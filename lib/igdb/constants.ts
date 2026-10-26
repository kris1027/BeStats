/**
 * Every fixed value the IGDB module sends, builds URLs from or bounds a read
 * with, in one place.
 *
 * Spec 0023 pins each one, so no page can widen a limit or change the catalog
 * filter by accident. The game type ids and the Erotic theme id come from
 * IGDB's own `game_types` and `themes` endpoints, and `pnpm igdb:live` checks
 * them against their names (AC-18), confirmed live on 2026-10-17.
 */

/** IGDB's API base. Every request is a POST to `{base}/{endpoint}` (AC-5). */
export const IGDB_API_BASE = "https://api.igdb.com/v4";

/** Twitch's token endpoint for the client credentials flow (AC-3). */
export const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";

/** IGDB's image CDN. A cover is `{base}/{size}/{image_id}.jpg`. */
export const IGDB_IMAGE_BASE = "https://images.igdb.com/igdb/image/upload";

/**
 * The cover size the module builds, and the ceiling the image loader steps
 * down from (spec 0025, AC-12). The 2x size, 528px wide, so the game hero's
 * 240px cover is sharp on a dense screen; a card asks for less and the loader
 * hands it a smaller rung, the rule the TMDB loader follows.
 */
export const IGDB_COVER_SIZE = "t_cover_big_2x";

/**
 * IGDB's cover sizes the loader may pick, narrowest first, with their pixel
 * widths (spec 0025, AC-12). `pnpm igdb:live` fetches each one and checks the
 * real width, so a changed IGDB size fails the live check, not a page.
 */
export const IGDB_COVER_LADDER: readonly { size: string; width: number }[] = [
  { size: "t_cover_small", width: 90 },
  { size: "t_cover_small_2x", width: 180 },
  { size: "t_cover_big", width: 264 },
  { size: "t_cover_big_2x", width: 528 },
];

/**
 * The art size the module builds, artwork or screenshot alike: the ceiling
 * the loader steps down from for the games hero and the wide cards (spec
 * 0028, AC-6). 1920px, so the full width hero is sharp.
 */
export const IGDB_ART_SIZE = "t_1080p";

/**
 * IGDB's art sizes the loader may pick, narrowest first, with their pixel
 * widths (spec 0028, AC-6). Kept apart from the cover ladder, so an art URL
 * is never matched against cover rungs. The two screenshot sizes are fixed
 * 16:9 crops (555 and 940 wide, measured live on 2026-10-25); `t_720p` and
 * `t_1080p` keep the image's own shape at that height, so their width is the
 * 16:9 width and a narrower image comes back narrower. `pnpm igdb:live`
 * checks each.
 */
export const IGDB_ART_LADDER: readonly { size: string; width: number }[] = [
  { size: "t_screenshot_med", width: 555 },
  { size: "t_screenshot_big", width: 940 },
  { size: "t_720p", width: 1280 },
  { size: IGDB_ART_SIZE, width: 1920 },
];

/**
 * The game types the catalog shows, by IGDB id (games.md, settled filter).
 * Every other id (DLC 1, expansion 2, bundle 3, mod 5, episode 6, season 7,
 * port 11, fork 12, pack 13, update 14) is hidden and normalizes to `other`.
 */
export const IGDB_VISIBLE_GAME_TYPES = {
  0: "main_game",
  4: "standalone_expansion",
  8: "remake",
  9: "remaster",
  10: "expanded_game",
} as const;

/**
 * IGDB's own popularity types behind the two popularity lists, by id, with
 * the name `pnpm igdb:live` checks against `popularity_types` (spec 0028,
 * AC-2, AC-6). Both have IGDB as their source (121), confirmed live on
 * 2026-10-25.
 */
export const IGDB_POPULARITY_TYPES = {
  trending: { id: 1, name: "Visits" },
  popular: { id: 3, name: "Playing" },
} as const;

/** The Erotic theme, hidden the way adult movies are (games.md). */
export const IGDB_EROTIC_THEME_ID = 42;

/**
 * A conservative reading of IGDB's limit of 4 requests a second: at most 4
 * open at once, and starts at least 250 ms apart (AC-6). One mechanism covers
 * both, so a burst can never open more than the limit allows.
 */
export const IGDB_RATE_PER_SECOND = 4;
export const IGDB_MAX_OPEN = 4;
export const IGDB_MIN_SPACING_MS = 1000 / IGDB_RATE_PER_SECOND;

/** Per attempt deadline, covering the body read too (AC-6). */
export const IGDB_TIMEOUT_MS = 8_000;

/** The token request's own deadline (AC-3). */
export const IGDB_TOKEN_TIMEOUT_MS = 8_000;

/** Total attempts for a 429 or 5xx: the first try plus two retries (AC-6). */
export const IGDB_MAX_ATTEMPTS = 3;

/** Backoff before attempt 2 and 3 when IGDB sends no `Retry-After`. */
export const IGDB_RETRY_DELAYS_MS = [250, 750] as const;

/** A token is refetched this long before Twitch says it expires (AC-3). */
export const IGDB_TOKEN_REFRESH_MARGIN_MS = 10 * 60 * 1000;

/** The longest a request waits for a limiter slot before it fails unsent. */
export const IGDB_SLOT_WAIT_MS = 5_000;

/** One whole read, token fetch and retries included, gives up after this. */
export const IGDB_READ_DEADLINE_MS = 20_000;

/** A `Retry-After` longer than this is cut down to it. */
export const IGDB_RETRY_AFTER_CAP_MS = 10_000;

/** IGDB's per query maximum, and so the batch size (AC-11). */
export const IGDB_BATCH_LIMIT = 500;

/** Results per page of a search or discover read (AC-12). */
export const IGDB_PAGE_SIZE = 20;

/**
 * Games on one games list page, and the page size every games list discover
 * asks for: the grid fills every row at 24 (spec 0028, AC-5).
 */
export const IGDB_LIST_PAGE_SIZE = 24;

/** The page sizes discover accepts: the default and the list page's. */
export const IGDB_DISCOVER_PAGE_SIZES = [
  IGDB_PAGE_SIZE,
  IGDB_LIST_PAGE_SIZE,
] as const;

/** The last page a caller may ask for; a later one throws (AC-12b). */
export const IGDB_MAX_PAGE = 50;

/** At most this many genre or platform ids in one filter (AC-12b). */
export const IGDB_MAX_FILTER_IDS = 20;

/** Search text, after trimming and stripping, is 1 to this many characters. */
export const IGDB_MAX_QUERY_LENGTH = 100;

/**
 * Every C0 and C1 control character, newlines and tabs included, which
 * `cleanSearchText` strips (AC-5). It lives here, not in `query.ts`, so
 * `/search`'s parser refuses the same text without importing the query
 * builder into the browser (spec 0029, AC-2). Global, so use it with
 * `replace`, never `test`.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point.
export const IGDB_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

/** The earliest release year a filter accepts (AC-12b). */
export const IGDB_MIN_YEAR = 1950;

/** A year filter may reach this many years past the current UTC year. */
export const IGDB_YEARS_AHEAD = 5;

/** The `fields` clause of `getGame` (spec 0023, fields per read). */
export const IGDB_GAME_FIELDS = [
  "name",
  "slug",
  "cover.image_id",
  "first_release_date",
  "platforms.name",
  "genres.name",
  "themes.name",
  "summary",
  "game_type",
  "version_parent",
  "rating",
  "rating_count",
  "storyline",
  "artworks.image_id",
  "screenshots.image_id",
  "videos.id",
  "videos.name",
  "videos.video_id",
  "similar_games",
  "involved_companies.company.id",
  "involved_companies.company.name",
  "involved_companies.developer",
  "involved_companies.publisher",
  "game_modes.name",
  "player_perspectives.name",
  "franchise.name",
  "franchises.name",
  "collections.name",
  "game_engines.name",
  "release_dates.date",
  "release_dates.date_format",
  "release_dates.platform.id",
  "release_dates.platform.name",
] as const;

/**
 * IGDB's `date_format` ids on a release date, by id (spec 0031, AC-10). An id
 * outside this map, or none, drops the entry rather than reading it as a full
 * day. `pnpm igdb:live` checks them against IGDB's `date_formats` endpoint
 * (AC-14).
 */
export const IGDB_DATE_FORMAT = {
  0: "day",
  1: "month",
  2: "year",
  3: "q1",
  4: "q2",
  5: "q3",
  6: "q4",
  7: "tbd",
} as const;

/** The most screenshots a game page shows (spec 0031, AC-6). */
export const IGDB_MAX_SCREENSHOTS = 12;

/**
 * The `fields` clause of a batch, search or discover read. Genres, platforms
 * and themes stay ids; their names come from the reference lists. Artworks
 * and screenshots give a card its wide art (spec 0028, AC-6).
 */
export const IGDB_SUMMARY_FIELDS = [
  "name",
  "cover.image_id",
  "artworks.image_id",
  "screenshots.image_id",
  "first_release_date",
  "rating",
  "rating_count",
  "genres",
  "platforms",
  "themes",
  "game_type",
  "version_parent",
] as const;
