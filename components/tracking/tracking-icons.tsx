import { cn } from "cn";

/**
 * The tracking marks, drawn as custom paths rather than approximated with a
 * stock icon (spec 0007, movie page row and card bookmark).
 *
 * Planned is a filled green bookmark with a
 * dark check cut into it. A stock `BookmarkCheck` strokes its outline and its
 * check in one colour, so it cannot put a green body behind a dark check. The
 * paths below come from the original badge legend, kept in its coordinates
 * through the `viewBox`. Colours come from the theme tokens, never literals.
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

/**
 * Stop watching: a square inside a circle (spec 0013, AC-16). The show status pill reuses it
 * for On Hold, the status it sets.
 */
function StopWatchingIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="-12 -12 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("size-3.5", className)}
    >
      <circle r="10" className="stroke-foreground" strokeWidth="1.8" />
      <rect
        x="-3"
        y="-3"
        width="6"
        height="6"
        rx=".7"
        className="stroke-foreground"
        strokeWidth="1.8"
      />
    </svg>
  );
}

/**
 * Next episode: a television, in the legend grey (spec 0013, AC-15). The status pill uses it for Watching.
 */
function NextEpisodeIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="-11 -12 22 22"
      fill="none"
      aria-hidden="true"
      className={cn("size-3.5", className)}
    >
      <g
        className="stroke-muted-foreground"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <rect x="-9" y="-6" width="18" height="14" rx="2" />
        <path d="m-4-11 4 5 4-5" />
      </g>
    </svg>
  );
}

/**
 * Release date: a calendar, in the
 * same grey as the Next episode television (spec 0014, AC-5, AC-12).
 */
function CalendarIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="-11 -12 22 23"
      fill="none"
      aria-hidden="true"
      className={cn("size-3.5", className)}
    >
      <g
        className="stroke-muted-foreground"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <rect x="-9" y="-8" width="18" height="18" rx="2" />
        <path d="M-9-2H9M-4-11V-5M4-11V-5" />
        <path
          d="M-4 2h.1M1 2h.1M5 2h.1M-4 6h.1M1 6h.1M5 6h.1"
          strokeWidth="2.5"
        />
      </g>
    </svg>
  );
}

/**
 * Dropped: a circle crossed by a slash. No reference draws it, so it follows
 * the Stop watching circle's weight and uses none of the meaning colours.
 */
function DroppedIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="-12 -12 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("size-3.5", className)}
    >
      <circle r="10" className="stroke-foreground" strokeWidth="1.8" />
      <path
        d="M-7 7 7-7"
        className="stroke-foreground"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Completed: a check. No reference draws it; like Dropped it keeps the
 * neutral colour, so it is never mistaken for Planned green.
 */
function CompletedIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="-12 -12 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("size-3.5", className)}
    >
      <path
        d="m-8 0 5 5L8-6"
        className="stroke-foreground"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export {
  CalendarIcon,
  CompletedIcon,
  DroppedIcon,
  NextEpisodeIcon,
  PlanIcon,
  PlannedIcon,
  StopWatchingIcon,
  WatchedIcon,
};
