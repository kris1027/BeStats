"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";

import { removeGame, setGameStatus } from "@/app/games/actions";

import { CardRoundButton } from "./card-round-button";
import { PlanIcon, PlannedIcon } from "./tracking-icons";
import { settleResultCall, showGameTrackingError } from "./tracking-toast";
import { showGameUndo } from "./use-game-undo";

/**
 * The Want to play bookmark on a game card (spec 0030, AC-3 to AC-5), the
 * game twin of `CardBookmarkButton`.
 *
 * Empty, a tap sets Want to play; filled, a tap removes the game, with the
 * Undo every game surface shares (`game-undo-{id}`). The icon flips at once
 * and the button refuses a second tap until the write settles, so two quick
 * taps can never land out of order (AC-4). A failed write rolls the icon back
 * as the transition ends. Every `undo` an action returns is shown, which is
 * how adding over a stale card that cleared a score is never silent (AC-5).
 */
function GameCardBookmarkButton({
  gameId,
  name,
  inList,
  returnPath,
}: {
  gameId: number;
  name: string;
  inList: boolean;
  returnPath: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(inList);

  function toggle() {
    const value = !optimistic;
    startTransition(async () => {
      setOptimistic(value);
      const result = await settleResultCall(() =>
        value ? setGameStatus(gameId, "want_to_play") : removeGame(gameId),
      );
      if (!result.ok) {
        showGameTrackingError(result.error, {
          gameId,
          control: "status",
          returnPath,
          navigate: router.push,
        });
        return;
      }
      const undo = result.undo;
      showGameUndo({
        gameId,
        undo,
        returnPath,
        navigate: router.push,
        restoring: () =>
          setOptimistic(undo?.previous.status === "want_to_play"),
      });
    });
  }

  return (
    <CardRoundButton
      label={`Want to play: ${name}`}
      pressed={optimistic}
      disabled={pending}
      onClick={toggle}
      className="ml-auto"
    >
      {optimistic ? (
        <PlannedIcon className="size-4" />
      ) : (
        <PlanIcon className="size-4" />
      )}
    </CardRoundButton>
  );
}

export { GameCardBookmarkButton };
