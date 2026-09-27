import { getShowStatuses, showIdsKey } from "@/lib/tracking/show-state";

import { ShowCardBookmarkButton } from "./show-card-bookmark-button";

/**
 * The TV bookmark on a `/shows` card or a `/search` TV result, for a signed in
 * user (spec 0013, AC-18), the `CardBookmark` pattern.
 *
 * Every card on the grid passes the same ids, so `getShowStatuses` runs once
 * per render for the whole grid. No row shows the outline Plan bookmark, Want
 * to Watch the filled Planned one; any other status shows nothing, because a
 * bookmark there would either lie about the status or silently replace it. A
 * visitor and a failed read also render nothing, and each card is its own
 * Suspense boundary, so the posters never wait on the session.
 *
 * @param showId The card's show.
 * @param name The TMDB name, for the accessible name.
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
  const result = await getShowStatuses(showIdsKey(gridShowIds));
  if (result.kind !== "ok") return null;

  const status = result.state.get(showId);
  if (status !== undefined && status !== "want_to_watch") return null;

  return (
    <ShowCardBookmarkButton
      showId={showId}
      name={name}
      planned={status === "want_to_watch"}
      returnPath={returnPath}
    />
  );
}

export { ShowCardBookmark };
