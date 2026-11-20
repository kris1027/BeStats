import type { V1LibraryEntry } from "@bestats/core/api/v1/library";
import type { LibraryPageKey } from "@bestats/core/catalog/library-list";
import { CATALOG_SOURCES } from "@bestats/core/catalog/media-type";
import {
  formatAirDate,
  formatCalculatedRating,
  formatPersonalScore,
  formatReleaseDate,
  formatShortDate,
} from "@bestats/core/format";
import {
  NEXT_EPISODE_MESSAGES,
  UPCOMING_MESSAGES,
  WATCHED_SHOW_LABELS,
} from "@bestats/core/tracking/messages";

/**
 * The badge in a card's top left corner: a community rating named by its
 * catalog (amber) or the user's own value (cyan), never both, so the two can
 * never be mistaken for each other (AGENTS.md section 9; spec 0033, AC-14).
 */
export type CardBadge = {
  tone: "community" | "personal";
  text: string;
  /** What a screen reader says: the value with whose it is. */
  label: string;
};

/** A pill over the poster's foot: a date, Date TBA or the next episode. */
export type CardPill = { text: string; label: string };

/**
 * Everything a library card shows, worked out from the server's entry
 * alone, so the app adds no data the server did not send (AGENTS.md
 * section 14).
 */
export type LibraryCardView =
  | {
      kind: "title";
      name: string;
      imageUrl: string | null;
      badge: CardBadge | null;
      pill: CardPill | null;
      meta: string | null;
    }
  /** The catalog no longer has the title: no page to open. */
  | { kind: "missing"; name: string }
  /** The catalog read failed for a stored title: the history still shows. */
  | { kind: "failed"; name: string };

/** The text a failed card shows in place of a name it could not read. */
export const FAILED_CARD_NAME = "Couldn't load this title";

function community(
  type: V1LibraryEntry["type"],
  value: number | null,
): CardBadge | null {
  if (value === null) return null;
  const source = CATALOG_SOURCES[type];
  return {
    tone: "community",
    // Named by its catalog, as `communityRatingText` prints it on the
    // catalog cards, so it never reads as the user's own.
    text: `${source} ${value.toFixed(1)}`,
    label: `${source} rating ${value.toFixed(1)}`,
  };
}

function personalScore(value: number | null): CardBadge | null {
  if (value === null) return null;
  const text = formatPersonalScore(value);
  return { tone: "personal", text, label: `Your score ${text}` };
}

/** A release date pill, or Date TBA, as the web's `ReleasePill`. */
function releasePill(date: string | null, today: string): CardPill {
  const release = formatReleaseDate(date, today);
  if (release === null) {
    return {
      text: UPCOMING_MESSAGES.dateTba,
      label: UPCOMING_MESSAGES.releaseTba,
    };
  }
  return {
    text: release.shortDate,
    label: UPCOMING_MESSAGES.releases(release.fullDate),
  };
}

/**
 * A library card as the web's cards draw it on each page
 * (prompts/mobile-library-tabs.md, decision 4):
 *
 * - Movies: Watchlist the TMDB rating; Coming soon the release date; Watched
 *   the user's score when there is one.
 * - Shows: Up next the next episode; Upcoming the next episode with its air
 *   date, or Date TBA; Watched the calculated show rating when a season is
 *   rated, and Finished or Caught up.
 * - Games: the user's score when there is one, else the IGDB rating; Coming
 *   soon also the release date.
 *
 * Dates are UTC days (AGENTS.md section 9).
 *
 * @param page The page key core resolved for the shown route.
 * @param today The UTC day (`todayUtc`), for the short date's year rule.
 */
export function libraryCardView(
  entry: V1LibraryEntry,
  page: LibraryPageKey,
  today: string,
): LibraryCardView {
  if (entry.card === null) return { kind: "failed", name: FAILED_CARD_NAME };
  if (entry.card.kind === "missing") {
    return {
      kind: "missing",
      name: `No longer on ${CATALOG_SOURCES[entry.type]}`,
    };
  }

  if (entry.type === "movie") {
    const card = entry.card;
    return {
      kind: "title",
      name: card.name,
      imageUrl: card.posterUrl,
      badge:
        page === "watchlist"
          ? community("movie", card.tmdbRating)
          : page === "watched"
            ? personalScore(entry.user.rating)
            : null,
      pill: page === "upcoming" ? releasePill(card.releaseDate, today) : null,
      meta: null,
    };
  }

  if (entry.type === "game") {
    const card = entry.card;
    return {
      kind: "title",
      name: card.name,
      imageUrl: card.coverUrl,
      badge:
        personalScore(entry.user.rating) ??
        community("game", card.communityRating),
      pill:
        page === "coming-soon" ? releasePill(card.releaseDate, today) : null,
      meta: null,
    };
  }

  const card = entry.card;
  const place = card.place;
  const base = {
    kind: "title" as const,
    name: card.name,
    imageUrl: card.posterUrl,
  };
  if (place.page === "watchlist") {
    const { season, episode } = place.next;
    return {
      ...base,
      badge: null,
      pill: {
        text: NEXT_EPISODE_MESSAGES.pill(season, episode),
        label: NEXT_EPISODE_MESSAGES.accessible(season, episode),
      },
      meta: null,
    };
  }
  if (place.page === "upcoming") {
    return {
      ...base,
      badge: null,
      pill: upcomingShowPill(place, today),
      meta: null,
    };
  }
  const rating = entry.user.showRating;
  return {
    ...base,
    badge:
      rating === null
        ? null
        : {
            tone: "personal",
            text: formatCalculatedRating(rating),
            label: `Your show rating ${formatCalculatedRating(rating)}`,
          },
    pill: null,
    meta: WATCHED_SHOW_LABELS[place.label],
  };
}

/**
 * The next episode and its short date, "S2E1 · Oct 20", or Date TBA, as the
 * web's `UpcomingShowPill` words it.
 */
function upcomingShowPill(
  place: {
    airDate: string | null;
    next: { season: number; episode: number } | null;
  },
  today: string,
): CardPill {
  const { airDate, next } = place;
  if (airDate !== null && next !== null) {
    const fullDate = formatAirDate(airDate) ?? airDate;
    const shortDate = formatShortDate(airDate, today) ?? fullDate;
    return {
      text: UPCOMING_MESSAGES.datedPill(next.season, next.episode, shortDate),
      label: UPCOMING_MESSAGES.episodeAirs(next.season, next.episode, fullDate),
    };
  }
  return {
    text: UPCOMING_MESSAGES.dateTba,
    label:
      next === null
        ? UPCOMING_MESSAGES.showDateTba
        : UPCOMING_MESSAGES.episodeDateTba(next.season, next.episode),
  };
}
