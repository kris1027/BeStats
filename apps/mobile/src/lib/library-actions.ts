import type { ClearedOf } from "@bestats/core/api/v1/cleared";
import type { V1Library, V1LibraryEntry } from "@bestats/core/api/v1/library";
import type {
  LibraryPageKey,
  LibraryPath,
} from "@bestats/core/catalog/library-list";
import type { LibraryType } from "@bestats/core/catalog/media-type";
import {
  EPISODE_TRACKING_MESSAGES,
  GAME_TRACKING_MESSAGES,
  GAME_UNDO_MESSAGES,
  LIBRARY_CARD_ACTION_LABELS,
  LIBRARY_MESSAGES,
  MARK_NEXT_MESSAGES,
  MISSING_SHOW_COPY,
  SHOW_TRACKING_COPY,
  SHOW_TRACKING_MESSAGES,
  TRACKING_MESSAGES,
  UNDO_EXPIRED_MESSAGES,
} from "@bestats/core/tracking/messages";
import { isStartedGame } from "@bestats/core/tracking/types";
import {
  type InfiniteData,
  useMutationState,
  useQueryClient,
} from "@tanstack/react-query";

import { useToast } from "@/components/toast";

import { ApiError } from "./api";
import { catalogKeys, fetchSeason } from "./catalog";
import { removeGame, restoreGame } from "./games";
import { libraryKeys } from "./library";
import { putMovieWatched, putMovieWatchlist, restoreMovie } from "./movies";
import { PRIVATE_QUERY_ROOT } from "./query-client";
import {
  putEpisodeWatched,
  restoreEpisode,
  restoreShowTracking,
  untrackShow,
} from "./shows";
import { useTrackingWrite, useUndoToast } from "./tracking";

/**
 * What a card's one quick action does, as the web's library card for the
 * same page offers it (prompts/mobile-card-quick-actions.md, decision 1).
 */
export type CardActionKind =
  | "unplan_movie"
  | "unmark_movie"
  | "remove_game"
  | "mark_next"
  | "stop_tracking";

/**
 * How the button looks: the green Planned bookmark, the Watched mark, the X,
 * or the next episode's check. `corner` buttons sit top right, as the web's
 * `CardRoundButton corner`; the rest sit bottom right.
 */
export type CardActionLook = "planned" | "watched" | "remove" | "mark";

export type CardAction = {
  kind: CardActionKind;
  look: CardActionLook;
  corner: boolean;
  /** The web button's accessible name, word for word. */
  label: string;
  /** Up next only: the episode the button marks. */
  next?: { season: number; episode: number };
};

/**
 * The name a card's button speaks: the title, or core's stand in when the
 * catalog no longer has it or its read failed, as the web's cards do.
 */
function cardName(entry: V1LibraryEntry, missing: string): string {
  return entry.card?.kind === "title" ? entry.card.name : missing;
}

/**
 * The quick action a library card carries on `page`, or null. Mirrors the
 * web's cards (components/library/library-card.tsx, game-library-card.tsx,
 * watchlist-show-controls.tsx and missing-show-card.tsx): movies unplan on
 * Watchlist and Coming soon and unmark on Watched; a game is removed with
 * the bookmark until it is started and with the X after; an Up next show
 * marks its next episode, and one TMDB no longer has offers Stop tracking;
 * Upcoming and Watched shows have no button (AGENTS.md section 7: their
 * history is edited on the show screen).
 */
export function cardActionFor(
  entry: V1LibraryEntry,
  page: LibraryPageKey,
): CardAction | null {
  switch (entry.type) {
    case "movie": {
      const name = cardName(entry, LIBRARY_CARD_ACTION_LABELS.missingTitle);
      if (page === "watched") {
        return {
          kind: "unmark_movie",
          look: "watched",
          corner: false,
          label: LIBRARY_CARD_ACTION_LABELS.unmarkMovie(name),
        };
      }
      return {
        kind: "unplan_movie",
        look: "planned",
        corner: true,
        label: LIBRARY_CARD_ACTION_LABELS.removeFromPage(name, page, "movie"),
      };
    }
    case "game": {
      if (entry.card?.kind === "title" && !isStartedGame(entry.user)) {
        return {
          kind: "remove_game",
          look: "planned",
          corner: true,
          label: LIBRARY_CARD_ACTION_LABELS.removeFromPage(
            entry.card.name,
            page,
            "game",
          ),
        };
      }
      return {
        kind: "remove_game",
        look: "remove",
        corner: false,
        label: LIBRARY_CARD_ACTION_LABELS.removeGame(
          cardName(entry, LIBRARY_CARD_ACTION_LABELS.missingGame),
        ),
      };
    }
    case "tv": {
      if (entry.card?.kind === "missing") {
        return {
          kind: "stop_tracking",
          look: "planned",
          corner: true,
          label: MISSING_SHOW_COPY.stopLabel,
        };
      }
      if (
        entry.card?.kind === "title" &&
        entry.card.place.page === "watchlist"
      ) {
        const { season, episode } = entry.card.place.next;
        return {
          kind: "mark_next",
          look: "mark",
          corner: false,
          label: MARK_NEXT_MESSAGES.markLabel(entry.card.name, season, episode),
          next: { season, episode },
        };
      }
      return null;
    }
  }
}

type LibraryData = InfiniteData<V1Library>;

type CardWrite = { entry: V1LibraryEntry; action: CardAction };

/** The removal answers the Undo is built from, per write. */
type RemovalResult =
  | ({ kind: "movie" } & Awaited<ReturnType<typeof putMovieWatched>>)
  | ({ kind: "game" } & Awaited<ReturnType<typeof removeGame>>)
  | ({ kind: "show" } & Awaited<ReturnType<typeof untrackShow>>);

/** The library page without one entry: the card hides at once (decision 4). */
function withoutEntry(data: LibraryData, entry: V1LibraryEntry): LibraryData {
  return {
    ...data,
    pages: data.pages.map((loaded) => ({
      ...loaded,
      entries: loaded.entries.filter(
        (shown) => !(shown.type === entry.type && shown.id === entry.id),
      ),
    })),
  };
}

/**
 * Thrown when the season read can't name the next episode. Its message is the
 * web's "Next episode unavailable": no number from a failed read is ever
 * marked (prompts/mobile-card-quick-actions.md, decision 2).
 */
class NextEpisodeUnavailable extends Error {}

/** One toast per card, so several removals in a row each keep their Undo. */
function controlFor(type: LibraryType, page: LibraryPageKey, id: number) {
  return `library-${type}-${page}-${id}`;
}

/** Each write also changes the title's own state on its screen (decision 6). */
const TITLE_STATE_KEYS = [
  [PRIVATE_QUERY_ROOT, "titles"],
  [PRIVATE_QUERY_ROOT, "season"],
];

/** Keeps the page as it is: an Undo and a mark wait for the server's order. */
function unchanged(data: LibraryData): LibraryData {
  return data;
}

/**
 * The quick actions of one library page (prompts/mobile-card-quick-actions.md,
 * decisions 4 to 6). Every write goes through `useTrackingWrite` with the
 * page's own cached query as its state, so a removal hides the card at once,
 * a refusal brings it back with the server's reason (and Retry offline), and
 * the page is refetched afterwards: placement stays the server's (AGENTS.md
 * section 9, section 11). Each Undo posts the write's own answer through
 * `postRestore`, never a copy of the page's state.
 *
 * @returns `run` to start a card's action, and `isPending` to disable a card
 * whose write is in flight, so a double tap sends one write.
 */
export function useLibraryCardActions(
  type: LibraryType,
  path: LibraryPath,
  page: LibraryPageKey,
) {
  const queries = useQueryClient();
  const toast = useToast();
  const offerUndo = useUndoToast();
  const stateKey = libraryKeys.page(type, path);
  const control = (vars: CardWrite) => controlFor(type, page, vars.entry.id);

  const pending = useMutationState({
    filters: { mutationKey: stateKey, status: "pending" },
    select: (mutation) => mutation.state.variables as CardWrite | undefined,
  });

  /** Runs an Undo and closes its toast once it settles, whatever the answer. */
  function settle(promise: Promise<unknown>, done: () => void) {
    promise.catch(() => {}).finally(done);
  }

  const movieUndo = useTrackingWrite({
    stateKey,
    control: (
      cleared: ClearedOf<"movie_watchlist"> | ClearedOf<"movie_watched">,
    ) => `${controlFor(type, page, cleared.movieId)}-undo`,
    apply: unchanged,
    write: restoreMovie,
    alsoInvalidate: TITLE_STATE_KEYS,
    failure: TRACKING_MESSAGES.write_failed,
    expired: page === "coming-soon" ? undefined : UNDO_EXPIRED_MESSAGES[page],
  });

  const gameUndo = useTrackingWrite({
    stateKey,
    control: (cleared: ClearedOf<"game_removed">) =>
      `${controlFor(type, page, cleared.gameId)}-undo`,
    apply: unchanged,
    write: restoreGame,
    alsoInvalidate: TITLE_STATE_KEYS,
    failure: GAME_TRACKING_MESSAGES.write_failed,
    expired: GAME_UNDO_MESSAGES.undoExpired,
  });

  const showUndo = useTrackingWrite({
    stateKey,
    control: (cleared: ClearedOf<"show_tracking">) =>
      `${controlFor(type, page, cleared.showId)}-undo`,
    apply: unchanged,
    write: restoreShowTracking,
    alsoInvalidate: TITLE_STATE_KEYS,
    failure: SHOW_TRACKING_MESSAGES.write_failed,
    expired: SHOW_TRACKING_COPY.undoExpired,
  });

  const episodeUndo = useTrackingWrite({
    stateKey,
    control: (cleared: ClearedOf<"episode">) =>
      `${controlFor(type, page, cleared.showId)}-undo`,
    apply: unchanged,
    write: restoreEpisode,
    alsoInvalidate: TITLE_STATE_KEYS,
    failure: EPISODE_TRACKING_MESSAGES.write_failed,
    expired: MARK_NEXT_MESSAGES.undoChanged,
  });

  const removal = useTrackingWrite({
    stateKey,
    control,
    apply: (data: LibraryData, vars: CardWrite) =>
      withoutEntry(data, vars.entry),
    write: async ({ entry, action }: CardWrite): Promise<RemovalResult> => {
      switch (action.kind) {
        case "unmark_movie":
          return { kind: "movie", ...(await putMovieWatched(entry.id, false)) };
        case "unplan_movie":
          return {
            kind: "movie",
            ...(await putMovieWatchlist(entry.id, false)),
          };
        case "remove_game":
          return { kind: "game", ...(await removeGame(entry.id)) };
        default:
          return { kind: "show", ...(await untrackShow(entry.id)) };
      }
    },
    alsoInvalidate: TITLE_STATE_KEYS,
    failure:
      type === "game"
        ? GAME_TRACKING_MESSAGES.write_failed
        : type === "tv"
          ? SHOW_TRACKING_MESSAGES.write_failed
          : TRACKING_MESSAGES.write_failed,
    onSuccess: (result, vars) => {
      const id = control(vars);
      const entryId = vars.entry.id;
      if (result.kind === "movie") {
        if (page === "coming-soon") return;
        const message = LIBRARY_MESSAGES[page].removed;
        if (vars.action.kind === "unplan_movie") {
          offerUndo(message, id, (done) =>
            settle(
              movieUndo.mutateAsync({
                kind: "movie_watchlist",
                movieId: entryId,
              }),
              done,
            ),
          );
          return;
        }
        // An unmark that removed nothing (another device got there first)
        // has nothing to put back (prompts/movie-plan-watched-exclusive.md).
        const cleared = result.cleared;
        if (!cleared) {
          toast.show({ id, message });
          return;
        }
        offerUndo(
          cleared.rating === null
            ? message
            : `${message}. ${LIBRARY_MESSAGES.watched.scoreRemoved}`,
          id,
          (done) =>
            settle(
              movieUndo.mutateAsync({
                kind: "movie_watched",
                movieId: entryId,
                ...cleared,
              }),
              done,
            ),
        );
        return;
      }
      if (result.kind === "game") {
        const undo = result.undo;
        if (undo?.kind !== "removed") {
          toast.show({ id, message: GAME_UNDO_MESSAGES.removed });
          return;
        }
        const cleared: ClearedOf<"game_removed"> = {
          kind: "game_removed",
          gameId: entryId,
          previous: undo.previous,
          removedAt: undo.removedAt,
        };
        offerUndo(GAME_UNDO_MESSAGES.removed, id, (done) =>
          settle(gameUndo.mutateAsync(cleared), done),
        );
        return;
      }
      const message = SHOW_TRACKING_COPY.stopped(MISSING_SHOW_COPY.toastName);
      const undo = result.undo;
      if (undo === null) {
        toast.show({ id, message });
        return;
      }
      offerUndo(message, id, (done) =>
        settle(
          showUndo.mutateAsync({
            kind: "show_tracking",
            showId: entryId,
            undo,
          }),
          done,
        ),
      );
    },
  });

  const markNext = useTrackingWrite({
    stateKey,
    control,
    apply: unchanged,
    write: async ({ entry, action }: CardWrite) => {
      const next = action.next;
      if (next === undefined) throw new NextEpisodeUnavailable();
      let episodeId: number | undefined;
      try {
        // The web's source of the id: the public, cached season read
        // (watchlist-show-controls.tsx). A season already opened costs
        // nothing.
        const season = await queries.ensureQueryData({
          queryKey: catalogKeys.season(entry.id, next.season),
          queryFn: () => fetchSeason(entry.id, next.season),
        });
        episodeId = season.episodes.find(
          (episode) => episode.episodeNumber === next.episode,
        )?.id;
      } catch (error) {
        // Offline keeps its own error, so the toast offers Retry.
        if (error instanceof ApiError && error.code === "network") throw error;
        throw new NextEpisodeUnavailable();
      }
      if (episodeId === undefined) throw new NextEpisodeUnavailable();
      const result = await putEpisodeWatched(episodeId, {
        showId: entry.id,
        season: next.season,
        watched: true,
      });
      return { ...result, episodeId };
    },
    alsoInvalidate: TITLE_STATE_KEYS,
    // "Next episode unavailable" only when the season read can't name it;
    // a failed episode write reads as any other episode write.
    failure: (error) =>
      error instanceof NextEpisodeUnavailable
        ? MARK_NEXT_MESSAGES.unavailable
        : EPISODE_TRACKING_MESSAGES.write_failed,
    onSuccess: (result, vars) => {
      const next = vars.action.next;
      if (next === undefined || vars.entry.card?.kind !== "title") return;
      const name = vars.entry.card.name;
      const id = control(vars);
      const markedAt = result.markedAt;
      if (!result.newlyMarked || markedAt === null) {
        toast.show({
          id,
          message: MARK_NEXT_MESSAGES.alreadyWatched(
            name,
            next.season,
            next.episode,
          ),
        });
        return;
      }
      offerUndo(
        MARK_NEXT_MESSAGES.marked(name, next.season, next.episode),
        id,
        (done) =>
          settle(
            episodeUndo.mutateAsync({
              kind: "episode",
              showId: vars.entry.id,
              episodeId: result.episodeId,
              markedAt,
            }),
            done,
          ),
      );
    },
  });

  return {
    run: (entry: V1LibraryEntry, action: CardAction) => {
      if (action.kind === "mark_next") markNext.mutate({ entry, action });
      else removal.mutate({ entry, action });
    },
    isPending: (entry: V1LibraryEntry) =>
      pending.some(
        (vars) =>
          vars?.entry !== undefined &&
          vars.entry.type === entry.type &&
          vars.entry.id === entry.id,
      ),
  };
}
