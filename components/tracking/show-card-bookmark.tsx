import { getTrackedShows, showIdsKey } from "@/lib/tracking/show-state";

import { ShowCardBookmarkButton } from "./show-card-bookmark-button";

/**
 * The TV bookmark on a `/shows` card or a `/search` TV result, for a signed in
 * user (spec 0020, AC-6), the `CardBookmark` pattern.
 *
 * Every card on the grid passes the same ids, so `getTrackedShows` runs once
 * per render for the whole grid. The bookmark is filled for a tracked show,
 * held or not, and empty otherwise. A visitor and a failed read render
 * nothing, and each card is its own Suspense boundary, so the posters never
 * wait on the session.
 *
 * @param showId The card's show.
 * @param name The TMDB name, for the accessible name and the toasts.
 * @param gridShowIds Every show id on the grid, the same array for each card.
 * @param returnPath The grid page, for the session expired toast.
 */
async function ShowCardBookmark({
  showId,
  name,
  gridShowIds,
  returnPath,
}: {
  showId: number;
  name: string;
  gridShowIds: readonly number[];
  returnPath: string;
}) {
  const result = await getTrackedShows(showIdsKey(gridShowIds));
  if (result.kind !== "ok") return null;

  const tracked = result.state.has(showId);
  return (
    <ShowCardBookmarkButton
      showId={showId}
      name={name}
      state={tracked ? { hold: result.state.get(showId) ?? null } : null}
      returnPath={returnPath}
    />
  );
}

export { ShowCardBookmark };
