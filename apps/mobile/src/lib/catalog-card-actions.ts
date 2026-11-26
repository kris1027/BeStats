import type {
  V1GameTitleState,
  V1MovieTitleState,
  V1ShowTitleState,
} from "@bestats/core/api/v1/titles";
import {
  gameCardStatus,
  isGameReleased,
} from "@bestats/core/catalog/game-page";
import { releasePillText } from "@bestats/core/catalog/library-card";
import {
  isMovieReleased,
  movieCardStatus,
} from "@bestats/core/catalog/movie-page";
import { formatPersonalScore, formatReleaseDate } from "@bestats/core/format";
import {
  type GameIntent,
  isGameStatusHeldBack,
} from "@bestats/core/tracking/game-intent";
import { movieTrackingAvailability } from "@bestats/core/tracking/intent";
import {
  CATALOG_CARD_ACTION_LABELS,
  GAME_STATUS_LABELS,
  LIBRARY_CARD_MESSAGES,
  MOVIE_TRACKING_LABELS,
  SHOW_TRACKING_COPY,
} from "@bestats/core/tracking/messages";

import { type CardPill, cardPill } from "./library-card";
import type { MovieWrite } from "./title-writes";

const MENU = CATALOG_CARD_ACTION_LABELS.menu;

/**
 * One action in a catalog card's long press menu
 * (prompts/mobile-look-card-actions.md, decision 2). `id` is stable per
 * action, for the menu's keys and the screen reader's custom actions;
 * `disabled` keeps it visible but off (decision 8); `destructive` marks a
 * removal, which offers Undo.
 */
export type CardMenuItem<TWrite> = {
  id: string;
  title: string;
  destructive: boolean;
  disabled: boolean;
  write: TWrite;
};

/**
 * What a card shows of the user's own state (decision 9), the web card's
 * slots: the green bookmark at the top right, the Watched mark at the bottom
 * right, the cyan score in place of the community pill, no community pill on
 * an Upcoming movie (the web's `CardRatingBadge`), and the pill at the
 * bottom: a game's status, or the release date of an Upcoming movie or an
 * unreleased Want to play game. `words` is what a screen reader hears for
 * the marks besides the pill.
 */
export type CardMarks = {
  bookmark: boolean;
  watched: boolean;
  score: number | null;
  community: boolean;
  pill: CardPill | null;
  words: string[];
};

function scoreWords(score: number | null): string[] {
  return score === null
    ? []
    : [`${LIBRARY_CARD_MESSAGES.yourScore} ${formatPersonalScore(score)}`];
}

/** The release pill, from core's `releasePillText`, as the library cards draw it. */
function releasePill(releaseDate: string | null, today: string): CardPill {
  return cardPill(releasePillText(formatReleaseDate(releaseDate, today)));
}

/**
 * A movie card's menu: Plan or Remove from plan, then Mark watched or Remove
 * watched mark. A movie is planned or watched, never both, so Plan on a
 * watched movie drops the mark and score with Undo (AGENTS.md section 7).
 * Mark watched follows core's release gate: before the release day (UTC) it
 * stays in the menu but off, unless a mark is already stored, which can be
 * removed. The server checks the gate again.
 */
export function movieCardMenu(
  state: V1MovieTitleState,
  releaseDate: string | null,
  today: string,
): CardMenuItem<MovieWrite>[] {
  const watched = state.watchedAt !== null;
  const { canMark } = movieTrackingAvailability(
    isMovieReleased(releaseDate, today),
    { watched, rating: state.rating },
  );
  return [
    {
      id: "plan",
      title: state.planned ? MENU.unplan : MENU.plan,
      destructive: state.planned,
      disabled: false,
      write: { kind: "watchlist", value: !state.planned, clears: "planned" },
    },
    {
      id: "watched",
      title: watched ? MENU.unmark : MENU.markWatched,
      destructive: watched,
      disabled: !canMark,
      write: watched
        ? { kind: "watched", value: false, clears: "unwatched" }
        : { kind: "watched", value: true },
    },
  ];
}

/**
 * A movie card's marks, placed by core's `movieCardStatus` on the same UTC
 * day as the web's catalog cards, never a copy (apps/mobile/AGENTS.md, BeStats
 * rules; AGENTS.md section 9), so a card shows what the movie's library page
 * shows: the cyan score on a scored watched movie, and on an Upcoming one the
 * release pill and no TMDB badge.
 */
export function movieCardMarks(
  state: V1MovieTitleState,
  releaseDate: string | null,
  today: string,
): CardMarks {
  const status = movieCardStatus(
    {
      inWatchlist: state.planned,
      watched: state.watchedAt !== null,
      rating: state.rating,
    },
    releaseDate,
    today,
  );
  const watched = status?.page === "watched";
  const score = status?.page === "watched" ? status.rating : null;
  return {
    bookmark: state.planned,
    watched,
    score,
    community: status?.page !== "upcoming",
    pill:
      status?.page === "upcoming"
        ? releasePill(status.releaseDate, today)
        : null,
    words: [
      ...(state.planned ? [MOVIE_TRACKING_LABELS.planned] : []),
      ...(watched ? [MOVIE_TRACKING_LABELS.watched] : []),
      ...scoreWords(score),
    ],
  };
}

/**
 * A show card's menu: Track, or Stop tracking, which keeps every mark and
 * rating and offers Undo (AGENTS.md section 7, tracking and history are
 * separate).
 */
export function showCardMenu(state: V1ShowTitleState): CardMenuItem<boolean>[] {
  return [
    {
      id: "tracking",
      title: state.tracked ? MENU.stopTracking : MENU.track,
      destructive: state.tracked,
      disabled: false,
      write: !state.tracked,
    },
  ];
}

/**
 * A show card's marks: the bookmark while tracked. The web's show rating,
 * Upcoming pill and Finished line need the library page placement, which the
 * v1 title state does not carry and the app may not work out itself
 * (apps/mobile/AGENTS.md, BeStats rules: placement is the server's; AGENTS.md
 * section 9), so they stay off the app's cards (decision 9).
 */
export function showCardMarks(state: V1ShowTitleState): CardMarks {
  return {
    bookmark: state.tracked,
    watched: false,
    score: null,
    community: true,
    pill: null,
    words: state.tracked ? [SHOW_TRACKING_COPY.tracking] : [],
  };
}

/**
 * A game card's menu, the web's bookmark: Want to play on a game not in the
 * list, and Remove from your games on one that is, whatever its status,
 * with Undo. Want to play is never held back by the release gate (AGENTS.md
 * section 7, games carry a status behind a release gate); if core ever holds
 * it back, it shows off rather than vanishing.
 */
export function gameCardMenu(
  state: V1GameTitleState,
  releaseDate: string | null,
  today: string,
): CardMenuItem<GameIntent>[] {
  if (state.status !== null) {
    return [
      {
        id: "status",
        title: MENU.removeGame,
        destructive: true,
        disabled: false,
        write: { kind: "status", value: null },
      },
    ];
  }
  return [
    {
      id: "status",
      title: MENU.wantToPlay,
      destructive: false,
      disabled: isGameStatusHeldBack(
        isGameReleased(releaseDate, today),
        null,
        "want_to_play",
      ),
      write: { kind: "status", value: "want_to_play" },
    },
  ];
}

/**
 * A game card's marks, from core's `gameCardStatus`, the web card's rule
 * (apps/mobile/AGENTS.md, BeStats rules; AGENTS.md section 7): the bookmark
 * on Want to play, with the release pill while the game is not out; on
 * Playing or Finished the status pill and, when scored, the cyan score.
 */
export function gameCardMarks(
  state: V1GameTitleState,
  releaseDate: string | null,
  today: string,
): CardMarks {
  const card = gameCardStatus(state, releaseDate, today);
  if (card === null || card.status === "want_to_play") {
    const wanted = card !== null;
    return {
      bookmark: wanted,
      watched: false,
      score: null,
      community: true,
      pill: card?.unreleased ? releasePill(releaseDate, today) : null,
      words: wanted ? [GAME_STATUS_LABELS.want_to_play] : [],
    };
  }
  const status = GAME_STATUS_LABELS[card.status];
  return {
    bookmark: false,
    watched: false,
    score: card.rating,
    community: true,
    pill: { text: status, label: status, isDate: false },
    words: scoreWords(card.rating),
  };
}
