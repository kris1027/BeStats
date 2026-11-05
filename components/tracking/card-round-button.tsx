import { cn } from "cn";
import type * as React from "react";

/**
 * The round glass button on a poster card, the bookmark and the status
 * circles on the list pages (spec 0007, AC-16; spec 0008).
 *
 * Presentational only: it holds no state and calls no action, so the grid
 * bookmark, which saves itself, and the list pages' remove buttons, whose
 * grid owns the removal, can share one look. The drawn circle is about 36px;
 * the button around it is 44px on mobile so a thumb can hit it, and shrinks to
 * the circle from `md`.
 *
 * @param label The accessible name. The icon inside is decorative.
 * @param pressed For a toggle, its state; leave it out for a plain action.
 * @param disabled While the action it started runs (spec 0014, AC-8): the
 * button refuses a second tap and reports itself busy.
 * @param corner For the Plan and Planned bookmarks, which `PosterCard` and
 * `WideCardView` place in the art's top right corner rather than the bottom
 * row (prompts/upcoming-date-pill-wrap.md). The button owns the offset: below
 * `md` its 44px box sits 4px out, so the 36px circle meets the badge's 10px
 * inset whatever card holds it (root AGENTS.md section 3, touch targets).
 */
function CardRoundButton({
  label,
  pressed,
  disabled,
  corner = false,
  onClick,
  className,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  corner?: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-busy={disabled || undefined}
      data-card-corner={corner ? "" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full disabled:cursor-default disabled:opacity-60 md:size-9",
        corner && "max-md:-m-1",
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
