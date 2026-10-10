/**
 * The tracking pill sizes the movie, episode and show controls share: 44px on
 * mobile for the touch target, 36px from `md` (spec 0007, AC-23). Kept in one
 * place so the three pages read as one system.
 */
export const TRACKING_PILL =
  "h-11 cursor-pointer px-4 transition-[filter] hover:brightness-125 md:h-9 md:px-3.5";

/**
 * A tracking pill that cannot act right now (an unaired episode, an
 * unreleased movie): the same size, still focusable, muted and inert.
 */
export const TRACKING_PILL_UNAVAILABLE =
  "h-11 cursor-not-allowed px-4 opacity-50 md:h-9 md:px-3.5";
