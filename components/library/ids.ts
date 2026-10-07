/**
 * The ids the library pages move the focus to (spec 0014, AC-16, carried
 * into spec 0020, AC-9). Plain values in a plain module, so the server cards
 * and the client controls share them.
 */

const SHOW_CARD_LINK_PREFIX = "library-show-";

/** The title link of one show card on a library page. */
export function showCardLinkId(showId: number): string {
  return `${SHOW_CARD_LINK_PREFIX}${showId}`;
}

/**
 * Finds any show card's title link from the shared prefix, so the selector
 * cannot drift from `showCardLinkId`.
 */
export const SHOW_CARD_LINK_SELECTOR = `a[id^="${SHOW_CARD_LINK_PREFIX}"]`;

/** Each library page's `h1`, which takes the focus when a list empties. */
export const LIBRARY_HEADING_ID = "library-heading";

/** The Paused & dropped disclosure's summary, which takes the focus last. */
export const HELD_SHOWS_SUMMARY_ID = "held-shows-summary";
