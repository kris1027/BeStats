import { UpcomingShowPill } from "@/components/library/show-cards";
import {
  CalculatedRatingBadge,
  TmdbRatingBadge,
} from "@/components/rating-badges";
import { requestTodayUtc } from "@/lib/tracking/episode-state";
import { WATCHED_SHOW_LABELS } from "@/lib/tracking/messages";
import { getShowGridStatus } from "@/lib/tracking/show-grid-status";
import { showIdsKey } from "@/lib/tracking/show-state";

import { ShowCardBookmarkButton } from "./show-card-bookmark-button";

/**
 * The three personal slots of a TV poster card on `/shows` and `/search`
 * (spec 0020, AC-6; prompts/catalog-card-status.md): a tracked show carries
 * what its library page shows, and keeps the bookmark that stops tracking.
 *
 * Every slot on the grid passes the same ids, so `getShowGridStatus` runs
 * once per render for the whole grid, and each slot is its own Suspense
 * boundary, so the posters never wait on the session. A visitor and a failed
 * read get the catalog card.
 */
type ShowCardProps = {
  showId: number;
  /** Every show id on the grid, the same array for each card. */
  gridShowIds: readonly number[];
};

/** The grid's read, or undefined for a visitor or a failed read. */
async function readGrid(gridShowIds: readonly number[]) {
  const result = await getShowGridStatus(showIdsKey(gridShowIds));
  return result.kind === "ok" ? result.state : undefined;
}

/**
 * The top right badge. The page renders the TMDB rating as the fallback, so
 * only tracked shows swap: the calculated show rating on a rated show on
 * Watched, nothing on Upcoming, the TMDB rating otherwise.
 *
 * @param tmdbRating The card's TMDB rating.
 */
async function ShowCardBadge({
  showId,
  gridShowIds,
  tmdbRating,
}: ShowCardProps & { tmdbRating: number | null }) {
  const status = (await readGrid(gridShowIds))?.get(showId);
  if (status?.page === "watched" && status.rating !== null) {
    return (
      <CalculatedRatingBadge value={status.rating} label="Your show rating" />
    );
  }
  if (status?.page === "upcoming") return null;
  return <TmdbRatingBadge value={tmdbRating} />;
}

/**
 * The line under the name: Finished or Caught up for a show on Watched,
 * after the catalog's own text (the year on `/search`) when there is one.
 *
 * @param base What the line shows today, and the Suspense fallback.
 */
async function ShowCardMeta({
  showId,
  gridShowIds,
  base,
}: ShowCardProps & { base: string | null }) {
  const status = (await readGrid(gridShowIds))?.get(showId);
  if (status?.page !== "watched") return base;
  const label = WATCHED_SHOW_LABELS[status.label];
  return base === null ? label : `${base} · ${label}`;
}

/**
 * The bottom row: the next episode's date pill or Date TBA on Upcoming, and
 * the bookmark, filled for every tracked show. Nothing for a visitor or a
 * failed read.
 *
 * @param name The TMDB name, for the accessible name and the toasts.
 * @param returnPath The grid page, for the session expired toast.
 */
async function ShowCardControls({
  showId,
  gridShowIds,
  name,
  returnPath,
}: ShowCardProps & { name: string; returnPath: string }) {
  const grid = await readGrid(gridShowIds);
  if (grid === undefined) return null;
  const status = grid.get(showId);

  const bookmark = (
    <ShowCardBookmarkButton
      showId={showId}
      name={name}
      tracked={grid.has(showId)}
      returnPath={returnPath}
    />
  );
  if (status?.page !== "upcoming") return bookmark;
  return (
    <>
      <UpcomingShowPill
        airDate={status.airDate}
        next={status.next}
        today={requestTodayUtc()}
      />
      {bookmark}
    </>
  );
}

export { ShowCardBadge, ShowCardControls, ShowCardMeta };
