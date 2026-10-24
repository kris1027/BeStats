"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { restoreGameStatus, restoreRemovedGame } from "@/app/games/actions";
import { GAME_UNDO_MESSAGES, UNDO_ACTION_LABEL } from "@/lib/tracking/messages";
import type { GameUndo } from "@/lib/tracking/types";

import {
  gameTrackingToastId,
  runUndoInToast,
  showGameTrackingError,
  UNDO_TOAST_MS,
} from "./tracking-toast";

/**
 * The two game toasts that carry an Undo (spec 0026, AC-4, AC-5): a removal,
 * and a move to Want to play that cleared a score. Both share the id
 * `game-undo-{id}`, so a newer one replaces an older one, and both run
 * through `runUndoInToast`, which keeps the toast while the restore runs.
 *
 * @param gameId The game.
 * @param returnPath Where the session expired toast's Sign in comes back to.
 */
export function useGameUndo({
  gameId,
  returnPath,
}: {
  gameId: number;
  returnPath: string;
}) {
  const router = useRouter();
  const toastId = `game-undo-${gameId}`;

  /**
   * Shows the toast for what a write can take back.
   *
   * @param undo The action's `undo`; nothing shows when it is absent.
   * @param restoring Runs inside the Undo's transition, for an optimistic
   * update that shows the old state back at once.
   */
  return function showUndo(undo: GameUndo | undefined, restoring?: () => void) {
    if (!undo) return;
    const message =
      undo.kind === "removed"
        ? GAME_UNDO_MESSAGES.removed
        : GAME_UNDO_MESSAGES.scoreCleared;
    toast(message, {
      id: toastId,
      duration: UNDO_TOAST_MS,
      action: {
        label: UNDO_ACTION_LABEL,
        onClick: (event) =>
          runUndoInToast(event, {
            id: toastId,
            message,
            expiredMessage: GAME_UNDO_MESSAGES.undoExpired,
            restore: () =>
              undo.kind === "removed"
                ? restoreRemovedGame(gameId, undo.previous, undo.removedAt)
                : restoreGameStatus(gameId, undo.previous),
            restoring,
            onError: (error) =>
              showGameTrackingError(error, {
                id: gameTrackingToastId(gameId, "status"),
                returnPath,
                navigate: router.push,
              }),
          }),
      },
    });
  };
}
