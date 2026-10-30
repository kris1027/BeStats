import { XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { PosterCard } from "@/components/poster-card";
import {
  IgdbRatingBadge,
  PersonalScoreBadge,
} from "@/components/rating-badges";
import { CardRoundButton } from "@/components/tracking/card-round-button";
import { GameStatusChip } from "@/components/tracking/game-status-chip";
import { PlannedIcon } from "@/components/tracking/tracking-icons";
import {
  type LibraryPageKey,
  libraryPageName,
} from "@/lib/catalog/library-list";
import { gameHref } from "@/lib/catalog/media-type";
import { isStartedGame } from "@/lib/tracking/types";

import { ReleasePill } from "./dated-pill";
import type { LibraryGameItem } from "./types";

/**
 * The caption and fallback tile text for a game IGDB no longer has (spec
 * 0027, AC-11). Never an invented name or a placeholder cover.
 */
const MISSING_GAME = "No longer on IGDB";

/**
 * One game card on a games tab (spec 0027, AC-8 to AC-12), built on
 * `PosterCard`.
 *
 * Want to play and Coming soon carry the amber IGDB community rating, and
 * Coming soon, where every game is not out yet, its release pill or Date TBA
 * (prompts/game-coming-soon.md). Playing and Finished carry the
 * cyan personal score when there is one, else the community rating, and the
 * Started or Finished month under the name. A hidden game keeps its card
 * but loses its link, because its page answers a soft 404 (AC-10). Every card
 * has one remove button, which only reports the tap: `GameLibraryGrid` owns
 * the optimistic hide, the action call and the toast. On Want to play it is
 * the green bookmark the catalog cards press, and on Playing and Finished
 * the X, after the read only status chip (spec 0030, AC-11). Which of these a tab
 * shows is decided once, on the server, by `gameLibraryTab`: the card shows
 * the score, release pill and date line its item carries.
 */
function GameLibraryCard({
  item,
  list,
  onRemove,
  priority = false,
}: {
  item: LibraryGameItem;
  /** The page the card is on, which its remove button names. */
  list: LibraryPageKey;
  onRemove: () => void;
  priority?: boolean;
}) {
  if (item.name === null) {
    return (
      <PosterCard
        title={MISSING_GAME}
        posterUrl={null}
        controls={
          <RemoveButton name={null} onRemove={onRemove} className="ml-auto" />
        }
      />
    );
  }

  return (
    <PosterCard
      title={item.name}
      posterUrl={item.coverUrl}
      href={item.hidden ? undefined : gameHref(item.gameId)}
      badge={cardBadge(item)}
      meta={item.dateLine ?? undefined}
      controls={
        <>
          {item.unreleased ? (
            <ReleasePill release={item.unreleased.date} />
          ) : null}
          {isStartedGame(item) ? (
            <>
              <GameStatusChip status={item.status} />
              <RemoveButton name={item.name} onRemove={onRemove} />
            </>
          ) : (
            <CardRoundButton
              label={`Remove ${item.name} from ${libraryPageName(list, "game")}`}
              onClick={onRemove}
              className="ml-auto"
            >
              <PlannedIcon className="size-4" />
            </CardRoundButton>
          )}
        </>
      }
      priority={priority}
    />
  );
}

/**
 * The cyan personal score when the item carries one, else the amber
 * community rating (AC-8, AC-9). A Want to play item never carries a score.
 */
function cardBadge(item: LibraryGameItem): ReactNode {
  if (item.rating !== null) {
    return <PersonalScoreBadge value={item.rating} />;
  }
  return <IgdbRatingBadge value={item.communityRating} />;
}

/**
 * The X. It sets no margin of its own: after a status chip, which already
 * pushes the row right, it needs none, and the missing game card, where it
 * stands alone, passes `ml-auto`.
 */
function RemoveButton({
  name,
  onRemove,
  className,
}: {
  name: string | null;
  onRemove: () => void;
  className?: string;
}) {
  return (
    <CardRoundButton
      label={`Remove ${name ?? "missing game"} from your games`}
      onClick={onRemove}
      className={className}
    >
      <XIcon className="size-4" aria-hidden="true" />
    </CardRoundButton>
  );
}

export { GameLibraryCard, MISSING_GAME };
