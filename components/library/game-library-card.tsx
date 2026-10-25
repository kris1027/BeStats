import { XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { PosterCard } from "@/components/poster-card";
import {
  IgdbRatingBadge,
  PersonalScoreBadge,
} from "@/components/rating-badges";
import { CardRoundButton } from "@/components/tracking/card-round-button";
import { gameHref } from "@/lib/catalog/media-type";

import { ReleasePill } from "./dated-pill";
import type { LibraryGameItem, LibraryList } from "./types";

/**
 * The caption and fallback tile text for a game IGDB no longer has (spec
 * 0027, AC-11). Never an invented name or a placeholder cover.
 */
const MISSING_GAME = "No longer on IGDB";

/**
 * One game card on a games tab (spec 0027, AC-8 to AC-12), built on
 * `PosterCard`.
 *
 * Want to play carries the amber IGDB community rating and, while the game
 * is not out, its release pill or Date TBA. Playing and Finished carry the
 * cyan personal score when there is one, else the community rating, and the
 * Started or Finished month under the name. A hidden game keeps its card
 * but loses its link, because its page answers a soft 404 (AC-10). Every card
 * has one remove button, which only reports the tap: `GameLibraryGrid` owns
 * the optimistic hide, the action call and the toast.
 *
 * @param list The tab, which picks the badge and the date line (AC-9).
 */
function GameLibraryCard({
  list,
  item,
  onRemove,
  priority = false,
}: {
  list: LibraryList;
  item: LibraryGameItem;
  onRemove: () => void;
  priority?: boolean;
}) {
  if (item.name === null) {
    return (
      <PosterCard
        title={MISSING_GAME}
        posterUrl={null}
        controls={<RemoveButton name={null} onRemove={onRemove} />}
      />
    );
  }

  const unreleased =
    list === "watchlist" && item.release.state === "unreleased"
      ? item.release
      : null;

  return (
    <PosterCard
      title={item.name}
      posterUrl={item.coverUrl}
      href={item.hidden ? undefined : gameHref(item.gameId)}
      badge={cardBadge(list, item)}
      meta={list === "watchlist" ? undefined : (item.dateLine ?? undefined)}
      controls={
        <>
          {unreleased ? <ReleasePill release={unreleased.date} /> : null}
          <RemoveButton name={item.name} onRemove={onRemove} />
        </>
      }
      priority={priority}
    />
  );
}

/**
 * The cyan personal score on Playing and Finished when there is one, else
 * the amber community rating (AC-8, AC-9). A score on a Want to play row
 * cannot exist (spec 0024, AC-2), so it is never looked at there.
 */
function cardBadge(list: LibraryList, item: LibraryGameItem): ReactNode {
  if (list !== "watchlist" && item.rating !== null) {
    return <PersonalScoreBadge value={item.rating} />;
  }
  return <IgdbRatingBadge value={item.communityRating} />;
}

function RemoveButton({
  name,
  onRemove,
}: {
  name: string | null;
  onRemove: () => void;
}) {
  return (
    <CardRoundButton
      label={`Remove ${name ?? "missing game"} from your games`}
      onClick={onRemove}
      className="ml-auto"
    >
      <XIcon className="size-4" aria-hidden="true" />
    </CardRoundButton>
  );
}

export { GameLibraryCard, MISSING_GAME };
