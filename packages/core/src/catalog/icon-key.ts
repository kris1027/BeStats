/**
 * Every mark a card can carry, in the order the key lists them: the web's
 * footer key and the app's About (prompts/mobile-look-account.md, decision
 * 9). Each app draws its own icon per `mark`; the words live here once so the
 * two keys never drift (AGENTS.md section 3). Each two state mark is listed as
 * a pair, action then done: Plan and Planned, Mark watched and Watched.
 */
export const ICON_KEY_ENTRIES = [
  { mark: "communityRating", label: "TMDB rating" },
  { mark: "personalScore", label: "Your score" },
  { mark: "plan", label: "Plan / Want to play" },
  { mark: "planned", label: "Planned / Want to play" },
  { mark: "markWatched", label: "Mark watched" },
  { mark: "watched", label: "Watched" },
  { mark: "nextEpisode", label: "Next episode" },
  { mark: "releaseDate", label: "Release date" },
] as const;

export type IconKeyMark = (typeof ICON_KEY_ENTRIES)[number]["mark"];

/** The accessible name of the key's list, on both apps. */
export const ICON_KEY_LABEL = "Icon key";
