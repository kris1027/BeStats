/**
 * The three private library pages a title can sit on (spec 0020, AC-8).
 * Defined once so the show classifier, the movie classifier and the page
 * components cannot drift apart. Pure, free of `server-only`, like the rest
 * of `lib/catalog/`.
 */
export type LibraryList = "watchlist" | "upcoming" | "watched";
