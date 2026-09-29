/**
 * The ids `/upcoming` moves the focus to (spec 0014, AC-12, AC-16), and the
 * page's own path. Plain values in a plain module, so the server cards and
 * the client controls share them.
 */

/** The page every Retry reloads and every Sign in toast returns to. */
export const UPCOMING_PATH = "/upcoming";

/** The title link of one Up Next card. */
export function upNextCardLinkId(showId: number): string {
  return `up-next-${showId}`;
}

/** The Coming soon heading, which takes the focus when its last card goes. */
export const COMING_SOON_HEADING_ID = "coming-soon-heading";
