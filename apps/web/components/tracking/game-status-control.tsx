"use client";

import { cn } from "cn";
import { StarIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useOptimistic, useRef, useState } from "react";

import { removeGame, setGameRating, setGameStatus } from "@/app/games/actions";
import { glassPillClassName } from "@/components/glass-pill";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatPersonalScore } from "@/lib/format";
import {
  applyGameIntent,
  canHoldScore,
  type GameIntent,
} from "@/lib/tracking/game-intent";
import { GAME_STATUS_LABELS } from "@/lib/tracking/messages";
import {
  GAME_STATUSES,
  type GameStatus,
  type GameTrackingResult,
  type GameTrackingState,
  type GameUndo,
} from "@/lib/tracking/types";

import { ScorePicker } from "./score-picker";
import { WatchedIcon } from "./tracking-icons";
import { TRACKING_PILL, TRACKING_PILL_UNAVAILABLE } from "./tracking-pill";
import {
  type GameControl,
  settleResultCall,
  showGameTrackingError,
} from "./tracking-toast";
import { useGameUndo } from "./use-game-undo";

/**
 * The game page's status pills and score (spec 0026, AC-2 to AC-8, AC-11).
 *
 * Three toggles in one group: a click on an unpressed pill sets that status,
 * a click on the pressed one removes the game. One `useOptimistic` holds the
 * whole state, reduced by `applyGameIntent`, which the tests pin against the
 * SQL, so a click shows its result at once; the optimistic value lasts only
 * while the action is in flight, and the confirmed state is always the
 * server prop `refresh()` delivers. Every target is read from the optimistic
 * value, so a double click sends two different targets.
 *
 * The score pill follows the three only on Playing or Finished. A move into
 * Finished with no score opens its picker at once; a move into Playing never
 * does (AC-7).
 *
 * Before release, Playing and Finished are `aria-disabled` unless pressed
 * (the pressed one can still remove), and the picker can clear but not score
 * (`AGENTS.md` "Games", release gate; AC-8). The server checks the same gate
 * again.
 */
function GameStatusControl({
  gameId,
  name,
  state,
  returnPath,
  releaseNote,
}: {
  gameId: number;
  name: string;
  state: GameTrackingState;
  /** Where the session expired toast's Sign in action comes back to. */
  returnPath: string;
  /**
   * Before release, the line under the pills: "Releases Oct 24, 2026" or
   * "Release date to be announced". Null once the game is out (UTC day).
   */
  releaseNote: string | null;
}) {
  const router = useRouter();
  const [optimistic, addIntent] = useOptimistic(state, applyGameIntent);
  const [pickerOpen, setPickerOpen] = useState(false);
  const initialFocusRef = useRef<HTMLButtonElement | null>(null);
  // Set while a status failure is the latest word, so a score queued behind
  // it (the auto open case) does not add its own `not_started` toast (AC-11).
  const statusFailedRef = useRef(false);

  const showUndo = useGameUndo({ gameId, returnPath });

  /** Shows the restored status and score at once while an Undo runs. */
  function showRestored(undo: GameUndo) {
    addIntent({ kind: "status", value: undo.previous.status });
    addIntent({ kind: "rating", value: undo.previous.rating });
  }

  function run(
    control: GameControl,
    intent: GameIntent,
    call: () => Promise<GameTrackingResult>,
    onError?: () => void,
  ) {
    if (control === "status") statusFailedRef.current = false;
    startTransition(async () => {
      addIntent(intent);
      const result = await settleResultCall(call);
      if (!result.ok) {
        onError?.();
        if (control === "status") statusFailedRef.current = true;
        if (
          control === "rating" &&
          result.error === "not_started" &&
          statusFailedRef.current
        ) {
          return;
        }
        showGameTrackingError(result.error, {
          gameId,
          control,
          returnPath,
          navigate: router.push,
        });
        return;
      }
      if ("undo" in result && result.undo) {
        const undo = result.undo;
        showUndo(undo, () => showRestored(undo));
      }
    });
  }

  function isHeldBack(status: GameStatus): boolean {
    return (
      releaseNote !== null &&
      status !== "want_to_play" &&
      optimistic.status !== status
    );
  }

  function choose(status: GameStatus) {
    if (isHeldBack(status)) return;
    if (optimistic.status === status) {
      run("status", { kind: "status", value: null }, () => removeGame(gameId));
      return;
    }
    const opensPicker =
      status === "finished" &&
      optimistic.status !== "finished" &&
      optimistic.rating === null;
    if (opensPicker) setPickerOpen(true);
    run(
      "status",
      { kind: "status", value: status },
      () => setGameStatus(gameId, status),
      opensPicker ? () => setPickerOpen(false) : undefined,
    );
  }

  function rate(value: number | null) {
    setPickerOpen(false);
    run("rating", { kind: "rating", value }, () =>
      setGameRating(gameId, value),
    );
  }

  const canScore = canHoldScore(optimistic.status);
  const scoreText = formatPersonalScore(optimistic.rating);

  return (
    <div data-slot="game-tracking" className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <fieldset
          aria-label={`Status for ${name}`}
          className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0"
        >
          {GAME_STATUSES.map((status) => {
            const pressed = optimistic.status === status;
            const heldBack = isHeldBack(status);
            const label = GAME_STATUS_LABELS[status];
            return (
              <button
                key={status}
                type="button"
                aria-label={`${label}: ${name}`}
                aria-pressed={pressed}
                aria-disabled={heldBack || undefined}
                onClick={() => choose(status)}
                className={cn(
                  glassPillClassName(),
                  heldBack ? TRACKING_PILL_UNAVAILABLE : TRACKING_PILL,
                )}
              >
                <WatchedIcon filled={pressed} />
                <span aria-hidden="true">{label}</span>
              </button>
            );
          })}
        </fieldset>

        {canScore && (
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger
              aria-label={`Your score for ${name}: ${scoreText}`}
              aria-haspopup="dialog"
              className={cn(glassPillClassName("score"), TRACKING_PILL)}
            >
              <StarIcon
                aria-hidden="true"
                className="size-3.5 fill-score-personal text-score-personal"
              />
              <span aria-hidden="true">
                {optimistic.rating === null ? "Rate" : scoreText}
              </span>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={8}
              initialFocus={initialFocusRef}
              className="w-auto max-w-[calc(100vw-2rem)]"
            >
              <PopoverTitle className="text-sm font-bold text-foreground">
                Your score
              </PopoverTitle>
              <ScorePicker
                rating={optimistic.rating}
                onPick={rate}
                onClear={() => rate(null)}
                initialFocusRef={initialFocusRef}
                unavailableNote={releaseNote ?? undefined}
              />
            </PopoverContent>
          </Popover>
        )}
      </div>

      {releaseNote !== null && (
        <p
          data-slot="game-release-note"
          className="text-sm text-text-secondary"
        >
          {releaseNote}
        </p>
      )}
    </div>
  );
}

export { GameStatusControl };
