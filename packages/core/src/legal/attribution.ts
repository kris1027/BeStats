/**
 * TMDB's required notice is a template whose noun names the kind of product:
 * "This [website, program, service, application, product] uses TMDB…" (API
 * Terms of Use, section 3, as updated 20 October 2023, read again 2026-11-21).
 * The sentence is written only here, so the web and the app can't drift apart
 * (spec 0034; AGENTS.md, Commands and repo facts, and section 12).
 */
function tmdbNotice(noun: "website" | "application"): string {
  return `This ${noun} uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.`;
}

/**
 * The web's notice (spec 0017, AC-3): the footer and `/terms` render it.
 */
export const TMDB_ATTRIBUTION = tmdbNotice("website");

/**
 * The phone app's notice (spec 0033, AC-14): About and the catalog notice
 * render it, because "This website…" is wrong inside an app. "application" is
 * one of the terms' own nouns; "app" is not, so it isn't used.
 */
export const TMDB_APP_ATTRIBUTION = tmdbNotice("application");
