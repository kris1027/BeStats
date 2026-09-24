/**
 * Every fixed value the TMDB module sends or builds URLs from, in one place.
 *
 * These are constants rather than options a caller passes, because spec 0002's
 * value sourcing table pins each one: the base URL, the language, the timeout,
 * the retry budget and the concurrency cap are decided once for the whole app
 * so no page can widen them by accident.
 */

/** TMDB's v3 REST base. The token is never part of a URL (spec 0002, AC-3). */
export const TMDB_API_BASE = "https://api.themoviedb.org/3";

/** TMDB's image CDN base. Sizes are appended by `imageUrl`. */
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

/**
 * English first metadata, per AGENTS.md section 3. Sent on every request so a
 * caller cannot silently fetch another language and mix it into the catalog.
 */
export const TMDB_LANGUAGE = "en-US";

/**
 * Per attempt deadline. A render must never hang on a slow upstream
 * (spec 0002, AC-11), so every request carries an abort signal built from this.
 */
export const TMDB_TIMEOUT_MS = 8_000;

/**
 * Total attempts for one logical read: the first try plus at most two retries
 * (spec 0002, AC-12). Pinned as a total rather than a retry count so the
 * ceiling is obvious at the call site.
 */
export const TMDB_MAX_ATTEMPTS = 3;

/**
 * Backoff before attempt 2 and attempt 3, in milliseconds, used when TMDB sends
 * no `Retry-After` header. Whether it sends one is undocumented, so both paths
 * exist; jitter keeps a burst of parallel reads from retrying in lockstep.
 */
export const TMDB_RETRY_DELAYS_MS = [250, 750] as const;

/**
 * How many requests one batch helper keeps in flight. This bounds a single call
 * inside a single process; it is not a fleet wide limiter, which spec 0002
 * records as an accepted gap to revisit at scope feature 9.
 */
export const TMDB_CONCURRENCY_LIMIT = 8;

/**
 * How many people a show's series cast keeps (spec 0009, AC-8). Applied in the
 * module, not on the page, so a show with hundreds of credited people caches
 * twelve. `CastRow`'s own `CAST_LIMIT` matches it.
 */
export const SHOW_CAST_LIMIT = 12;

/**
 * The wording TMDB's terms require, quoted verbatim (spec 0002, AC-22). Where
 * it is displayed belongs to scope feature 18; this module only owns the text.
 */
export const TMDB_ATTRIBUTION =
  "This product uses the TMDB API but is not endorsed or certified by TMDB.";
