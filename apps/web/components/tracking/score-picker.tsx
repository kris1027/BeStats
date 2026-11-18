"use client";

import { cn } from "cn";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** Arrow key steps: one along a row, five between the two rows (AC-7). */
const STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -5,
  ArrowDown: 5,
};

/**
 * The ten score choices and the Clear rating button (spec 0007, AC-7).
 *
 * Built by hand instead of with Base UI's `RadioGroup`, which selects on every
 * arrow key press: here that would save a rating per key press, and a person
 * stepping from 3 to 8 would write five ratings on the way. So the arrows only
 * move focus (a roving `tabindex`), and Enter or Space, which a native button
 * turns into a click, is what commits.
 *
 * @param rating The score to show as checked, or null.
 * @param onPick Called with the chosen score.
 * @param onClear Called when Clear rating is pressed.
 * @param initialFocusRef Receives the choice that holds the tab stop, so the
 * popover can move focus straight to it on open.
 * @param unavailableNote When set, a score cannot be picked right now: the ten
 * choices stay focusable (so the keyboard rules still hold) but are
 * `aria-disabled` and do nothing, under this note. Clear rating still works,
 * which is how a future dated episode's old score can be removed (spec 0011,
 * AC-2).
 */
function ScorePicker({
  rating,
  onPick,
  onClear,
  initialFocusRef,
  unavailableNote,
}: {
  rating: number | null;
  onPick: (score: number) => void;
  onClear: () => void;
  initialFocusRef: React.RefObject<HTMLButtonElement | null>;
  unavailableNote?: string;
}) {
  const unavailable = unavailableNote !== undefined;
  const [focused, setFocused] = useState(rating ?? 1);
  const noteId = useId();
  const choices = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent, score: number) {
    let next: number | null = null;
    if (event.key in STEPS) next = score + STEPS[event.key];
    else if (event.key === "Home") next = 1;
    else if (event.key === "End") next = 10;
    if (next === null) return;

    event.preventDefault();
    const clamped = Math.min(10, Math.max(1, next));
    setFocused(clamped);
    choices.current[clamped - 1]?.focus();
  }

  return (
    <div className="flex flex-col gap-3">
      {unavailable ? (
        <p id={noteId} className="text-sm text-text-secondary">
          {unavailableNote}
        </p>
      ) : null}
      <div
        role="radiogroup"
        aria-label="Your score"
        aria-describedby={unavailable ? noteId : undefined}
        className="grid grid-cols-5 gap-2"
      >
        {SCORES.map((score) => {
          const checked = score === rating;
          return (
            // biome-ignore lint/a11y/useSemanticElements: a native radio commits on every arrow key, which would save a rating per key press (AC-7).
            <button
              key={score}
              ref={(node) => {
                choices.current[score - 1] = node;
                if (score === focused) initialFocusRef.current = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-disabled={unavailable || undefined}
              tabIndex={score === focused ? 0 : -1}
              onKeyDown={(event) => onKeyDown(event, score)}
              onFocus={() => setFocused(score)}
              onClick={() => {
                if (!unavailable) onPick(score);
              }}
              className={cn(
                "glass flex size-11 items-center justify-center rounded-full text-sm font-bold",
                unavailable
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer transition-[filter] hover:brightness-125",
                checked
                  ? "glass-rim-score glass-plate-score text-score-personal"
                  : "glass-rim glass-plate text-foreground",
              )}
            >
              {score}
            </button>
          );
        })}
      </div>

      {rating === null ? null : (
        <Button
          variant="link"
          size="touch"
          onClick={onClear}
          className="self-center px-3 md:h-9"
        >
          Clear rating
        </Button>
      )}
    </div>
  );
}

export { ScorePicker };
