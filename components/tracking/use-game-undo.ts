"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { restoreGameStatus, restoreRemovedGame } from "@/app/games/actions";
import { GAME_UNDO_MESSAGES, UNDO_ACTION_LABEL } from "@/lib/tracking/messages";
import type { GameUndo } from "@/lib/tracking/types";

import {
  type GameToastTarget,
  runUndoInToast,
  showGameTrackingError,
  UNDO_TOAST_MS,
} from "./tracking-toast";

/**
 * Shows the toast for what a game write can take back (spec 0026, AC-4,
 * AC-5): a removal, or a move to Want to play that cleared a score. Every
 * game Undo toast for one game shares the id `game-undo-{id}`, so a newer one
 * replaces an older one, whichever surface showed it. It runs through
 * `runUndoInToast`, which keeps the toast while the restore runs.
 *
 * A plain function, not a hook, so the games library grid can show one per
 * card (spec 0027, AC-12). The toast holds only the action and `navigate`,
 * so its Undo still works after the grid that showed it is gone.
 *
 * @param options.undo The action's `undo`; nothing shows when it is absent.
 * @param options.restoring Runs inside the Undo's transition, for an
 * optimistic update that shows the old state back at once.
 */
export function showGameUndo({
  gameId,
  undo,
  returnPath,
  navigate,
  restoring,
}: GameToastTarget & {
  undo: GameUndo | undefined;
  restoring?: () => void;
}): void {
  if (!undo) return;
  const toastId = `game-undo-${gameId}`;
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
              gameId,
              control: "status",
              returnPath,
              navigate,
            }),
        }),
    },
  });
}

/**
 * `showGameUndo` for the game page, which shows one game: it binds the game,
 * the return path and the router.
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

  return function showUndo(undo: GameUndo | undefined, restoring?: () => void) {
    showGameUndo({
      gameId,
      undo,
      returnPath,
      navigate: router.push,
      restoring,
    });
  };
}
