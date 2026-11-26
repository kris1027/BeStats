import type { ReleaseDate } from "../format";
import { formatAirDate, formatMonthYear, formatShortDate } from "../format";
import { GAME_DATE_LINES, UPCOMING_MESSAGES } from "../tracking/messages";
import type { EpisodePlace } from "../tv/library-page";

import type { LibraryPageKey } from "./library-list";
import type { LibraryType } from "./media-type";

/**
 * What a library card's top left badge shows on a page: the community
 * rating, the user's score, the score falling back to the community rating,
 * or the calculated show rating. Personal and community values never share
 * a badge (AGENTS.md section 9).
 */
export type LibraryCardBadge =
  | "community"
  | "personal"
  | "personal-else-community"
  | "show-rating";

/**
 * Which badge each library page's cards carry, per tab (spec 0020, AC-8,
 * AC-9, AC-12, AC-13; spec 0027, AC-8, AC-9). The one place a page decides
 * its badge, so the web and the app can never show different ones
 * (prompts/mobile-library-review-fixes.md, item 4). Want to play and Coming
 * soon games carry no score: their rows cannot hold one (spec 0024, AC-2).
 */
const LIBRARY_CARD_BADGES = {
  movie: { watchlist: "community", upcoming: null, watched: "personal" },
  tv: { watchlist: null, upcoming: null, watched: "show-rating" },
  game: {
    "coming-soon": "community",
    watchlist: "community",
    upcoming: "personal-else-community",
    watched: "personal-else-community",
  },
} as const satisfies Record<
  LibraryType,
  Partial<Record<LibraryPageKey, LibraryCardBadge | null>>
>;

/**
 * The badge a card on `page` of the `type` tab carries, or null for none.
 * A page the tab lacks (Coming soon on shows) carries none.
 */
export function libraryCardBadge(
  type: LibraryType,
  page: LibraryPageKey,
): LibraryCardBadge | null {
  const badges: Partial<Record<LibraryPageKey, LibraryCardBadge | null>> =
    LIBRARY_CARD_BADGES[type];
  return badges[page] ?? null;
}

/**
 * A date pill's words: the printed text and the full accessible label, or
 * Date TBA with its own label. Each app draws it its own way; the words are
 * shared so they never differ (AGENTS.md section 3, real metadata only).
 */
export type CardPillText =
  | { kind: "dated"; text: string; label: string }
  | { kind: "tba"; label: string };

/**
 * An Upcoming show pill's words, with the date also on its own for a card too
 * narrow to print the episode beside it, so no caller formats the date again
 * (prompts/mobile-date-pill-visible.md, decision 1).
 */
export type EpisodePillText =
  | (Extract<CardPillText, { kind: "dated" }> & { date: string })
  | Extract<CardPillText, { kind: "tba" }>;

/**
 * The release pill on a movie's Coming soon card and a game's Coming soon
 * card (spec 0020, AC-13; prompts/game-coming-soon.md): the short date, or
 * Date TBA. The date is `formatReleaseDate`'s, a UTC day (AGENTS.md section 9).
 */
export function releasePillText(release: ReleaseDate): CardPillText {
  if (release === null) {
    return { kind: "tba", label: UPCOMING_MESSAGES.releaseTba };
  }
  return {
    kind: "dated",
    text: release.shortDate,
    label: UPCOMING_MESSAGES.releases(release.fullDate),
  };
}

/**
 * The pill on an Upcoming show card (spec 0020, AC-11): the next episode and
 * its short date, "S2E1 · Oct 20", or Date TBA naming the episode when it is
 * known. Air dates are UTC days (AGENTS.md section 9).
 *
 * @param today The UTC day, for `formatShortDate`'s year rule.
 */
export function upcomingEpisodePill(
  airDate: string | null,
  next: EpisodePlace | null,
  today: string,
): EpisodePillText {
  if (airDate !== null && next !== null) {
    const fullDate = formatAirDate(airDate) ?? airDate;
    const shortDate = formatShortDate(airDate, today) ?? fullDate;
    return {
      kind: "dated",
      text: UPCOMING_MESSAGES.datedPill(next.season, next.episode, shortDate),
      label: UPCOMING_MESSAGES.episodeAirs(next.season, next.episode, fullDate),
      date: shortDate,
    };
  }
  return {
    kind: "tba",
    label:
      next === null
        ? UPCOMING_MESSAGES.showDateTba
        : UPCOMING_MESSAGES.episodeDateTba(next.season, next.episode),
  };
}

/**
 * The month line under a game card (spec 0027, AC-9): "Started Feb 2026" on
 * Playing and "Finished Oct 2026" on Finished, the month of the date the page
 * orders by; none elsewhere, nor without that date.
 *
 * @param dates The stored `timestamptz` values, as PostgREST returns them.
 */
export function gameDateLine(
  page: LibraryPageKey,
  dates: { startedAt: string | null; finishedAt: string | null },
): string | null {
  if (page === "upcoming") {
    return monthLine(dates.startedAt, GAME_DATE_LINES.started);
  }
  if (page === "watched") {
    return monthLine(dates.finishedAt, GAME_DATE_LINES.finished);
  }
  return null;
}

function monthLine(
  iso: string | null,
  line: (month: string) => string,
): string | null {
  const month = iso === null ? null : formatMonthYear(iso);
  return month === null ? null : line(month);
}
