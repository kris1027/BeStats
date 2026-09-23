import { cn } from "cn";
import type * as React from "react";

/**
 * The round glass button on a poster card, per `bookmark-button` in
 * `design/show-movie-card.svg` and the status circles on the list artboards
 * (spec 0007, AC-16; spec 0008).
 *
 * Presentational only: it holds no state and calls no action, so the grid
 * bookmark, which saves itself, and the list pages' remove buttons, whose
 * grid owns the removal, can share one look. The drawn circle is about 36px;
 * the button around it is 44px on mobile so a thumb can hit it, and shrinks to
 * the circle from `md`.
 *
 * @param label The accessible name. The icon inside is decorative.
 * @param pressed For a toggle, its state; leave it out for a plain action.
 */
function CardRoundButton({
  label,
  pressed,
  onClick,
  className,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full md:size-9",
        className,
      )}
    >
      <span className="glass glass-rim glass-plate glass-shadow flex size-9 items-center justify-center rounded-full backdrop-blur-glass transition-[filter] hover:brightness-125">
        {children}
      </span>
    </button>
  );
}

export { CardRoundButton };
