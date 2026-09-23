import { PosterCard } from "@/components/poster-card";
import {
  PersonalScoreBadge,
  TmdbRatingBadge,
} from "@/components/rating-badges";
import { CardRoundButton } from "@/components/tracking/card-round-button";
import { PlannedIcon, WatchedIcon } from "@/components/tracking/tracking-icons";

import type { LibraryItem, LibraryList } from "./types";

/**
 * The caption and fallback tile text for a title TMDB no longer has
 * (spec 0008, AC-11). Never an invented title or a placeholder poster.
 */
const MISSING_TITLE = "No longer on TMDB";

/**
 * One card on a list page (spec 0008, AC-1, AC-2), built on `PosterCard`.
 *
 * The watchlist card carries the amber TMDB rating and the green Planned
 * button; the watched card carries the cyan personal score, only when the
 * movie has one, and the filled watched mark. Watched cards show no TMDB
 * rating, as the artboard draws them. Either button only reports the tap
 * through `onRemove`: `LibraryGrid` owns the optimistic hide, the action call
 * and the toast.
 */
function LibraryCard({
  list,
  item,
  onRemove,
  priority,
}: {
  list: LibraryList;
  item: LibraryItem;
  onRemove: () => void;
  priority: boolean;
}) {
  if (item.title === null) {
    return <MissingTitleCard list={list} onRemove={onRemove} />;
  }

  const badge =
    list === "watchlist" ? (
      <TmdbRatingBadge value={item.tmdbRating} />
    ) : item.rating !== null ? (
      <PersonalScoreBadge value={item.rating} />
    ) : undefined;

  return (
    <PosterCard
      title={item.title}
      posterUrl={item.posterUrl}
      href={`/movies/${item.movieId}`}
      badge={badge}
      controls={
        <RemoveButton list={list} title={item.title} onRemove={onRemove} />
      }
      priority={priority}
    />
  );
}

/**
 * A row whose movie TMDB no longer has (`missingIds`). It keeps the card's
 * footprint and its remove button, so the user can clear the row, but has no
 * title link because there is no page to open (AC-11).
 */
function MissingTitleCard({
  list,
  onRemove,
}: {
  list: LibraryList;
  onRemove: () => void;
}) {
  return (
    <PosterCard
      title={MISSING_TITLE}
      posterUrl={null}
      controls={<RemoveButton list={list} title={null} onRemove={onRemove} />}
    />
  );
}

function RemoveButton({
  list,
  title,
  onRemove,
}: {
  list: LibraryList;
  title: string | null;
  onRemove: () => void;
}) {
  const name = title ?? "missing title";

  return list === "watchlist" ? (
    <CardRoundButton
      label={`Remove ${name} from Watchlist`}
      onClick={onRemove}
      className="ml-auto"
    >
      <PlannedIcon className="size-4" />
    </CardRoundButton>
  ) : (
    <CardRoundButton
      label={`Unmark ${name} as watched`}
      onClick={onRemove}
      className="ml-auto"
    >
      <WatchedIcon filled className="size-4" />
    </CardRoundButton>
  );
}

export { LibraryCard, MISSING_TITLE, MissingTitleCard };
