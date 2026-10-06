import type { ReactNode } from "react";

import { PosterCard } from "@/components/poster-card";
import {
  CalculatedRatingBadge,
  PersonalScoreBadge,
  TmdbRatingBadge,
} from "@/components/rating-badges";
import { CardRoundButton } from "@/components/tracking/card-round-button";
import {
  PlannedIcon,
  StopWatchingIcon,
  WatchedIcon,
} from "@/components/tracking/tracking-icons";

import type { LibraryItem, LibraryList } from "./types";

/**
 * The caption and fallback tile text for a title TMDB no longer has
 * (spec 0008, AC-11). Never an invented title or a placeholder poster.
 */
const MISSING_TITLE = "No longer on TMDB";

/**
 * One card on a list page (spec 0008, AC-1, AC-2; spec 0013, AC-15 to
 * AC-17), built on `PosterCard`.
 *
 * The watchlist card carries the amber TMDB rating and, bottom right, the
 * button that takes it off the list: the green Planned bookmark for a movie
 * or a Want to Watch show, Stop watching for a Watching show. A show card
 * also carries its Next episode pill bottom left, streamed from the server.
 * The watched card carries the cyan personal score, only when the movie has
 * one, and the filled watched mark. A Completed show on the watched page
 * carries its calculated show rating, only when it has one, never the TMDB
 * rating, and no button at all: its history is edited on the show page,
 * never from this grid (spec 0019, AC-5, AC-6). Every button only reports the
 * tap through `onRemove`: `LibraryGrid` owns the optimistic hide, the action
 * call and the toast.
 *
 * @param nextEpisode A show card's Next episode pill, already wrapped in its
 * own Suspense boundary so the card never waits for it.
 */
function LibraryCard({
  list,
  item,
  nextEpisode,
  onRemove,
  priority,
}: {
  list: LibraryList;
  item: LibraryItem;
  nextEpisode?: ReactNode;
  onRemove: () => void;
  priority: boolean;
}) {
  if (item.title === null) {
    return <MissingTitleCard list={list} item={item} onRemove={onRemove} />;
  }

  const badge =
    list === "watchlist" ? (
      <TmdbRatingBadge value={item.tmdbRating} />
    ) : item.kind === "tv" ? (
      item.showRating !== null ? (
        <CalculatedRatingBadge
          value={item.showRating}
          label="Your show rating"
        />
      ) : undefined
    ) : item.rating !== null ? (
      <PersonalScoreBadge value={item.rating} />
    ) : undefined;

  return (
    <PosterCard
      title={item.title}
      posterUrl={item.posterUrl}
      href={
        item.kind === "tv" ? `/shows/${item.tmdbId}` : `/movies/${item.tmdbId}`
      }
      badge={badge}
      controls={
        isRemovable(list, item) ? (
          <>
            {item.kind === "tv" ? nextEpisode : null}
            <RemoveButton
              list={list}
              item={item}
              title={item.title}
              onRemove={onRemove}
            />
          </>
        ) : undefined
      }
      priority={priority}
    />
  );
}

/**
 * Whether a card carries a button. Every card does, except a show on the
 * watched page: nothing there unmarks, removes or changes a show (spec 0019,
 * AC-6). Explicit here rather than a side effect of `RemoveButton`'s
 * branches, which would otherwise draw an Unmark button for it.
 */
function isRemovable(
  list: LibraryList,
  item: Pick<LibraryItem, "kind">,
): boolean {
  return !(list === "watched" && item.kind === "tv");
}

/**
 * A row whose title TMDB no longer has (`missingIds`). It keeps the card's
 * footprint and the removal its status implies, so the user can clear the
 * row, but has no title link because there is no page to open (spec 0008,
 * AC-11; spec 0013, AC-17). A show on the watched page has no removal, so its
 * card has no button either (spec 0019, AC-8).
 */
function MissingTitleCard({
  list,
  item,
  onRemove,
}: {
  list: LibraryList;
  item: Pick<LibraryItem, "kind" | "status">;
  onRemove: () => void;
}) {
  return (
    <PosterCard
      title={MISSING_TITLE}
      posterUrl={null}
      controls={
        isRemovable(list, item) ? (
          <RemoveButton
            list={list}
            item={item}
            title={null}
            onRemove={onRemove}
          />
        ) : undefined
      }
    />
  );
}

function RemoveButton({
  list,
  item,
  title,
  onRemove,
}: {
  list: LibraryList;
  item: Pick<LibraryItem, "kind" | "status">;
  title: string | null;
  onRemove: () => void;
}) {
  const name = title ?? "missing title";

  if (list === "watched") {
    return (
      <CardRoundButton
        label={`Unmark ${name} as watched`}
        onClick={onRemove}
        className="ml-auto"
      >
        <WatchedIcon filled className="size-4" />
      </CardRoundButton>
    );
  }

  if (item.kind === "tv" && item.status === "watching") {
    return (
      <CardRoundButton
        label={`Stop watching ${name}`}
        onClick={onRemove}
        className="ml-auto"
      >
        <StopWatchingIcon className="size-4" />
      </CardRoundButton>
    );
  }

  return (
    <CardRoundButton
      label={`Remove ${name} from Watchlist`}
      onClick={onRemove}
      className="ml-auto"
    >
      <PlannedIcon className="size-4" />
    </CardRoundButton>
  );
}

export { LibraryCard, MISSING_TITLE, MissingTitleCard };
