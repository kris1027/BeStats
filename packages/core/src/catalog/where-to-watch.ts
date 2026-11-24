/**
 * The words of Where to watch and the age rating pill, shared by the web's
 * title pages and the app's title screens (spec 0022, AC-9, AC-12, AC-13;
 * prompts/mobile-look-title-extras.md, decision 7), so the two never drift.
 * The country is always named, because it is a guess from the connection.
 */

/** The three provider groups in their AC-12 order, each with its label. */
export const WHERE_TO_WATCH_GROUPS = [
  { key: "stream", label: "Stream" },
  { key: "free", label: "Free" },
  { key: "rentOrBuy", label: "Rent or buy" },
] as const;

/** The section heading; without a country while it is not known yet. */
export function whereToWatchHeading(regionName: string | null): string {
  return regionName === null
    ? "Where to watch"
    : `Where to watch in ${regionName}`;
}

/** The line when the country has no provider in any group. */
export function notStreamingLine(regionName: string): string {
  return `Not streaming in ${regionName} right now.`;
}

/** The link to TMDB's watch page for the country. */
export const ALL_WATCH_OPTIONS_LABEL = "All options on TMDB";

/**
 * The only watch link the web renders and the app opens (AGENTS.md section
 * 11: validate what crosses a boundary; prompts/mobile-look-title-extras.md,
 * "External URLs the app opens are built from validated values only"). TMDB
 * sends it as free text, so the normalizer drops anything that is not an
 * https page on TMDB's own host, and the v1 schema refuses it again, so a
 * changed upstream value can never hand the phone another scheme or site.
 */
export const TMDB_WATCH_LINK = /^https:\/\/www\.themoviedb\.org\/[^\s]*$/;

/** What a screen reader says before the age rating, and the web's tooltip. */
export function ageRatingLabel(regionName: string): string {
  return `Age rating in ${regionName}`;
}
