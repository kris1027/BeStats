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
 * The link every show card on a library page carries: the show's page, and
 * the id the focus returns to (spec 0020, AC-9). One place, so the four show
 * cards cannot drift apart. Spread into `PosterCard`.
 */
export function showCardLink(showId: number): {
  href: string;
  linkId: string;
} {
  return { href: `/shows/${showId}`, linkId: showCardLinkId(showId) };
}

/**
 * Finds any show card's title link from the shared prefix, so the selector
 * cannot drift from `showCardLinkId`.
 */
export const SHOW_CARD_LINK_SELECTOR = `a[id^="${SHOW_CARD_LINK_PREFIX}"]`;

/** Each library page's `h1`, which takes the focus when a list empties. */
export const LIBRARY_HEADING_ID = "library-heading";
