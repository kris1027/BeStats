import type { ReactNode } from "react";

import { PosterCard } from "@/components/poster-card";
import {
  PersonalScoreBadge,
  TmdbRatingBadge,
} from "@/components/rating-badges";
import { CardRoundButton } from "@/components/tracking/card-round-button";
import { PlannedIcon, WatchedIcon } from "@/components/tracking/tracking-icons";
import { UPCOMING_MESSAGES } from "@/lib/tracking/messages";

import { DatedPill, DateTbaPill } from "./dated-pill";
import type { LibraryList, LibraryMovieItem } from "./types";

/**
 * The caption and fallback tile text for a title TMDB no longer has
 * (spec 0008, AC-11). Never an invented title or a placeholder poster.
 */
const MISSING_TITLE = "No longer on TMDB";

/**
 * One movie card on a library page (spec 0008, AC-1, AC-2; spec 0020,
 * AC-13), built on `PosterCard`.
 *
 * The Watchlist card carries the amber TMDB rating and the green Planned
 * bookmark that unplans it. The Upcoming card carries its release date, or
 * Date TBA, bottom left, and the same bookmark, with no rating badge (the
 * spec 0014 Coming soon card). The Watched card carries the cyan personal
 * score, only when the movie has one, and the filled watched mark. Every
 * button only reports the tap through `onRemove`: `LibraryGrid` owns the
 * optimistic hide, the action call and the toast.
 */
function LibraryCard({
  list,
  item,
  onRemove,
  priority,
}: {
  list: LibraryList;
  item: LibraryMovieItem;
  onRemove: () => void;
  priority: boolean;
}) {
  if (item.title === null) {
    return <MissingTitleCard list={list} onRemove={onRemove} />;
  }

  return (
    <PosterCard
      title={item.title}
      posterUrl={item.posterUrl}
      href={`/movies/${item.tmdbId}`}
      badge={cardBadge(list, item)}
      controls={
        <>
          {list === "upcoming" ? <ReleasePill item={item} /> : null}
          <RemoveButton list={list} title={item.title} onRemove={onRemove} />
        </>
      }
      priority={priority}
    />
  );
}

/** The release date on an Upcoming card, or Date TBA (AC-13). */
function ReleasePill({ item }: { item: LibraryMovieItem }) {
  if (item.release === null) {
    return <DateTbaPill label={UPCOMING_MESSAGES.releaseTba} />;
  }
  return (
    <DatedPill
      slot="release-date"
      label={UPCOMING_MESSAGES.releases(item.release.fullDate)}
      text={item.release.shortDate}
    />
  );
}

/**
 * The badge a card carries: the amber TMDB rating on Watchlist, the cyan
 * personal score on Watched when there is one, and none on Upcoming.
 */
function cardBadge(list: LibraryList, item: LibraryMovieItem): ReactNode {
  if (list === "watchlist") return <TmdbRatingBadge value={item.tmdbRating} />;
  if (list === "watched" && item.rating !== null) {
    return <PersonalScoreBadge value={item.rating} />;
  }
  return undefined;
}

/**
 * A row whose title TMDB no longer has (`missingIds`). It keeps the card's
 * footprint and its removal, so the user can clear the row, but has no title
 * link because there is no page to open (spec 0008, AC-11; spec 0020,
 * AC-17).
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

  return (
    <CardRoundButton
      label={`Remove ${name} from ${list === "upcoming" ? "Upcoming" : "Watchlist"}`}
      onClick={onRemove}
      className="ml-auto"
    >
      <PlannedIcon className="size-4" />
    </CardRoundButton>
  );
}

export { LibraryCard, MISSING_TITLE, MissingTitleCard };
