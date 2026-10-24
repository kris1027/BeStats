import { RetryLink } from "@/components/retry-link";
import { gameReleaseNote, isGameReleased } from "@/lib/catalog/game-page";
import { requestTodayUtc } from "@/lib/tracking/episode-state";
import { getGameTracking } from "@/lib/tracking/game-state";
import { TRACKING_READ_FAILED } from "@/lib/tracking/messages";

import { GameStatusControl } from "./game-status-control";

/**
 * The game page's tracking slot: nothing for a visitor, the retry line when
 * the read fails, otherwise the status control with the stored state (spec
 * 0026, AC-1, AC-12), the movie slot's shape.
 *
 * It reads the session, so the page renders it inside its own Suspense
 * boundary with a `null` fallback: a visitor never sees a skeleton for a
 * control they will not get, and a signed in user never sees a default that
 * then corrects itself.
 *
 * The release gate is decided here, from the request's UTC day, so the
 * control only receives the line (AC-8). The line lives in the slot, so only
 * a signed in user sees it.
 *
 * @param gameId The game, already confirmed by `loadGame`.
 * @param name The IGDB name, for every accessible name.
 * @param releaseDate `Game.releaseDate`, the UTC day of IGDB's
 * `first_release_date`.
 */
async function GameTrackingSlot({
  gameId,
  name,
  releaseDate,
}: {
  gameId: number;
  name: string;
  releaseDate: string | null;
}) {
  const result = await getGameTracking(gameId);
  const returnPath = `/games/${gameId}`;

  if (result.kind === "signed_out") return null;

  if (result.kind === "failed") {
    return (
      <div
        data-slot="game-tracking-failed"
        className="flex flex-wrap items-center gap-3"
      >
        <p className="text-sm text-muted-foreground">{TRACKING_READ_FAILED}</p>
        <RetryLink href={returnPath} className="md:h-9" />
      </div>
    );
  }

  return (
    <GameStatusControl
      gameId={gameId}
      name={name}
      state={result.state}
      returnPath={returnPath}
      releaseNote={
        isGameReleased(releaseDate, requestTodayUtc())
          ? null
          : gameReleaseNote(releaseDate)
      }
    />
  );
}

export { GameTrackingSlot };
