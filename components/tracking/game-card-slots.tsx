/**
 * The two personal slots of a game card on `/games`, the `/games/{slug}`
 * lists and `/search?type=game` (spec 0030), the game twin of
 * `movie-card-slots.tsx`.
 *
 * Every slot on a grid passes the same ids, so `getGameGridStates` runs once
 * per render for the whole grid (AC-1). Each slot is its own Suspense
 * boundary, so the covers never wait on the session (AC-13). A visitor, a
 * clone with no Supabase configuration and a failed read all get the plain
 * catalog card; the failure is logged inside the read (AC-9). The card shows
 * the stored status as it is, so it always matches the library tab (AC-8).
 */
import { ReleasePill } from "@/components/library/dated-pill";
import {
  IgdbRatingBadge,
  PersonalScoreBadge,
} from "@/components/rating-badges";
import { type GameCardStatus, gameCardStatus } from "@/lib/catalog/game-page";
import { formatReleaseDate } from "@/lib/format";
import { requestTodayUtc } from "@/lib/tracking/episode-state";
import { getGameGridStates } from "@/lib/tracking/game-state";
import { idsKey } from "@/lib/tracking/ids-key";
import { isStartedGame } from "@/lib/tracking/types";

import { GameCardBookmarkButton } from "./game-card-bookmark-button";
import { GameStatusChip } from "./game-status-chip";

type GameCardProps = {
  gameId: number;
  /** The IGDB release date already on the card. */
  releaseDate: string | null;
  /** Every game id on the grid, the same array for each card. */
  gridGameIds: readonly number[];
};

/**
 * What the grid read says about this card. `unknown` is a visitor or a failed
 * read, which get the plain catalog card (AC-9); `known` carries the stored
 * status, where null is a game the user has no row for.
 */
type CardRead =
  | { kind: "unknown" }
  | { kind: "known"; card: GameCardStatus | null };

async function readCard({
  gameId,
  releaseDate,
  gridGameIds,
}: GameCardProps): Promise<CardRead> {
  const result = await getGameGridStates(idsKey(gridGameIds));
  if (result.kind !== "ok") return { kind: "unknown" };
  return {
    kind: "known",
    card: gameCardStatus(
      result.state.get(gameId),
      releaseDate,
      requestTodayUtc(),
    ),
  };
}

/**
 * The top right badge (AC-2): the cyan score on a scored Playing or Finished
 * game, IGDB's community rating otherwise. The page renders the IGDB rating
 * as the fallback, so only a scored game swaps.
 *
 * @param communityRating The card's IGDB rating out of 10.
 */
async function GameCardBadge({
  communityRating,
  ...props
}: GameCardProps & { communityRating: number | null }) {
  const read = await readCard(props);
  if (
    read.kind === "known" &&
    isStartedGame(read.card) &&
    read.card.rating !== null
  ) {
    return <PersonalScoreBadge value={read.card.rating} />;
  }
  return <IgdbRatingBadge value={communityRating} />;
}

/**
 * The bottom row: the read only chip on a Playing or Finished game (AC-6),
 * and the Want to play bookmark otherwise (AC-3), with the release pill
 * beside it while a wanted game is not out (AC-7). Nothing for a visitor or
 * a failed read (AC-9).
 *
 * @param name The IGDB name, for the accessible names.
 * @param returnPath The grid page, for the session expired toast.
 * @param releasePill False on a card that already prints the release date
 *   for everyone, so the date is not shown twice (AC-7).
 */
async function GameCardControls({
  name,
  returnPath,
  releasePill = true,
  ...props
}: GameCardProps & {
  name: string;
  returnPath: string;
  releasePill?: boolean;
}) {
  const read = await readCard(props);
  if (read.kind === "unknown") return null;
  const { card } = read;

  if (isStartedGame(card)) {
    return <GameStatusChip status={card.status} />;
  }

  return (
    <>
      {releasePill && card?.unreleased && (
        <ReleasePill
          release={formatReleaseDate(props.releaseDate, requestTodayUtc())}
        />
      )}
      <GameCardBookmarkButton
        gameId={props.gameId}
        name={name}
        inList={card !== null}
        returnPath={returnPath}
      />
    </>
  );
}

export { GameCardBadge, GameCardControls };
