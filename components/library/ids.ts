/**
 * The ids `/upcoming` moves the focus to (spec 0014, AC-12, AC-16; spec 0015,
 * AC-7). Plain values in a plain module, so the server cards and the client
 * controls share them. The page's URLs come from `typedHref`, whose
 * `TypedPath` type already refuses a misspelt `"/upcoming"` (feature 22).
 */

const UP_NEXT_CARD_LINK_PREFIX = "up-next-";

/** The title link of one Up Next card. */
export function upNextCardLinkId(showId: number): string {
  return `${UP_NEXT_CARD_LINK_PREFIX}${showId}`;
}

/**
 * Finds any card's title link from the shared prefix, so the selector cannot
 * drift from `upNextCardLinkId`; the `a` qualifier keeps `UP_NEXT_HEADING_ID`
 * out of it.
 */
export const UP_NEXT_CARD_LINK_SELECTOR = `a[id^="${UP_NEXT_CARD_LINK_PREFIX}"]`;

/**
 * The Up Next heading, which takes the focus when a mark completes the only
 * show left in the list (spec 0015, AC-7).
 */
export const UP_NEXT_HEADING_ID = "up-next-heading";

/** The Coming soon heading, which takes the focus when its last card goes. */
export const COMING_SOON_HEADING_ID = "coming-soon-heading";
