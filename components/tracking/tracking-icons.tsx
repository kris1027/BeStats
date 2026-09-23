import { cn } from "cn";

/**
 * The tracking marks, drawn from `design/` rather than approximated with a
 * stock icon (spec 0007, movie page row and card bookmark).
 *
 * `design/badge-legend.svg` draws Planned as a filled green bookmark with a
 * dark check cut into it. A stock `BookmarkCheck` strokes its outline and its
 * check in one colour, so it cannot put a green body behind a dark check. The
 * paths below are the legend's own, kept in its coordinates through the
 * `viewBox`. Colours come from the theme tokens, never literals.
 *
 * All of them are decorative: the button around each one carries the name.
 */

type IconProps = { className?: string };

/** Plan: the outline bookmark from `plan` in the legend and the card. */
function PlanIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="865.5 52.5 21 27"
      fill="none"
      aria-hidden="true"
      className={cn("size-3.5", className)}
    >
      <path
        d="M869 54H883A2 2 0 0 1 885 56V77A1 1 0 0 1 883.5 77.8L876 73.5L868.5 77.8A1 1 0 0 1 867 77V56A2 2 0 0 1 869 54Z"
        className="stroke-foreground"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Planned: the green filled bookmark with its check, from `planned`. */
function PlannedIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="643.5 52.5 21 27"
      fill="none"
      aria-hidden="true"
      className={cn("size-3.5", className)}
    >
      <path
        d="M647 54H661A2 2 0 0 1 663 56V79L654 73L645 79V56A2 2 0 0 1 647 54Z"
        className="fill-status-planned"
      />
      <path
        d="m649.5 63.5 3 3 5-5"
        className="stroke-status-planned-mark"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Watched and not watched: a circle check, outlined or filled near white. No
 * reference draws a watched mark, so it deliberately uses none of the three
 * meaning colours (`components/AGENTS.md`).
 */
function WatchedIcon({ filled, className }: IconProps & { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("size-3.5", className)}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        strokeWidth="2.5"
        className={cn("stroke-foreground", filled && "fill-foreground")}
      />
      <path
        d="m8 12 3 3 5-5"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={filled ? "stroke-background" : "stroke-foreground"}
      />
    </svg>
  );
}

export { PlanIcon, PlannedIcon, WatchedIcon };
