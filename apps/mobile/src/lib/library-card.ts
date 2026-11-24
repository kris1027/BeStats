import type { V1LibraryEntry } from "@bestats/core/api/v1/library";
import {
  type CardPillText,
  gameDateLine,
  libraryCardBadge,
  releasePillText,
  upcomingEpisodePill,
} from "@bestats/core/catalog/library-card";
import type { LibraryPageKey } from "@bestats/core/catalog/library-list";
import { CATALOG_SOURCES } from "@bestats/core/catalog/media-type";
import {
  formatCalculatedRating,
  formatPersonalScore,
  formatReleaseDate,
} from "@bestats/core/format";
import {
  LIBRARY_CARD_MESSAGES,
  NEXT_EPISODE_MESSAGES,
  UPCOMING_MESSAGES,
  WATCHED_SHOW_LABELS,
} from "@bestats/core/tracking/messages";

import {
  communityRatingLabel,
  communityRatingText,
} from "@/components/poster-card";

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
export const FAILED_CARD_NAME = LIBRARY_CARD_MESSAGES.failed;

/**
 * The amber community badge, worded by the catalog cards' own helpers so a
 * game reads "IGDB community rating" everywhere (AGENTS.md section 9).
 */
function community(
  type: V1LibraryEntry["type"],
  value: number | null,
): CardBadge | null {
  const text = communityRatingText(type, value);
  const label = communityRatingLabel(type, value);
  return text === null || label === null
    ? null
    : { tone: "community", text, label };
}

function personalScore(value: number | null): CardBadge | null {
  if (value === null) return null;
  const text = formatPersonalScore(value);
  return {
    tone: "personal",
    text,
    label: `${LIBRARY_CARD_MESSAGES.yourScore} ${text}`,
  };
}

/** Core's pill words as the card draws them: Date TBA prints its own text. */
/**
 * A core pill as a card draws it: Date TBA prints short and is heard in full.
 * The library cards and the catalog cards' own marks
 * (prompts/mobile-look-card-actions.md, decision 9) share it, so the two
 * never print a different pill for the same date (AGENTS.md section 9, UTC
 * days).
 */
export function cardPill(pill: CardPillText): CardPill {
  return pill.kind === "tba"
    ? { text: UPCOMING_MESSAGES.dateTba, label: pill.label }
    : { text: pill.text, label: pill.label };
}

/**
 * A library card as the web's cards draw it on each page. The badge per page
 * is core's `libraryCardBadge`, the pills core's `releasePillText` and
 * `upcomingEpisodePill`, and a game's month line core's `gameDateLine`, the
 * same rules the web reads (prompts/mobile-library-review-fixes.md), so the
 * app adds no data the server did not send and no rule of its own (AGENTS.md
 * section 14; apps/mobile/AGENTS.md, BeStats rules):
 *
 * - Movies: Watchlist the TMDB rating; Coming soon the release date; Watched
 *   the user's score when there is one.
 * - Shows: Up next the next episode; Upcoming the next episode with its air
 *   date, or Date TBA; Watched the calculated show rating when a season is
 *   rated, and Finished or Caught up.
 * - Games: Coming soon and Want to play the IGDB rating, Coming soon also the
 *   release date; Playing and Finished the user's score, else the IGDB
 *   rating, and the Started or Finished month.
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
      name: LIBRARY_CARD_MESSAGES.missing(CATALOG_SOURCES[entry.type]),
    };
  }
  const badge = libraryCardBadge(entry.type, page);

  if (entry.type === "movie") {
    const card = entry.card;
    return {
      kind: "title",
      name: card.name,
      imageUrl: card.posterUrl,
      badge:
        badge === "community"
          ? community("movie", card.tmdbRating)
          : badge === "personal"
            ? personalScore(entry.user.rating)
            : null,
      pill:
        page === "upcoming"
          ? cardPill(
              releasePillText(formatReleaseDate(card.releaseDate, today)),
            )
          : null,
      meta: null,
    };
  }

  if (entry.type === "game") {
    const card = entry.card;
    const rating = community("game", card.communityRating);
    return {
      kind: "title",
      name: card.name,
      imageUrl: card.coverUrl,
      badge:
        badge === "personal-else-community"
          ? (personalScore(entry.user.rating) ?? rating)
          : rating,
      pill:
        page === "coming-soon"
          ? cardPill(
              releasePillText(formatReleaseDate(card.releaseDate, today)),
            )
          : null,
      meta: gameDateLine(page, card),
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
      pill: cardPill(upcomingEpisodePill(place.airDate, place.next, today)),
      meta: null,
    };
  }
  const rating = entry.user.showRating;
  return {
    ...base,
    badge:
      badge === "show-rating" && rating !== null
        ? {
            tone: "personal",
            text: formatCalculatedRating(rating),
            label: `${LIBRARY_CARD_MESSAGES.yourShowRating} ${formatCalculatedRating(rating)}`,
          }
        : null,
    pill: null,
    meta: WATCHED_SHOW_LABELS[place.label],
  };
}
