import { cn } from "cn";

import { GlassPill } from "@/components/glass-pill";
import { CalendarIcon } from "@/components/tracking/tracking-icons";

/** A short date that carries its year, such as `Feb 3, 2027`. */
const ENDS_IN_YEAR = /\d{4}$/;

/**
 * The calendar pill on the Upcoming page (spec 0014, AC-5, AC-12): the
 * calendar glyph and a short date, smaller below `md` (32px, 11px text) than
 * above it.
 *
 * At a 375px two column grid the 44px touch target leaves no room for the
 * glyph beside a date with a year, so below `sm` that pill drops the glyph
 * rather than cutting the date. The full date is always in the accessible
 * text.
 *
 * @param label The pill's accessible text, with the full date.
 * @param text What the pill prints.
 */
function DatedPill({
  slot,
  label,
  text,
}: {
  slot: string;
  label: string;
  text: string;
}) {
  return (
    <GlassPill
      data-slot={slot}
      icon={<CalendarIcon />}
      className={cn(
        "h-8 min-w-0 px-2.5 text-[11px] backdrop-blur-glass md:h-9 md:px-3 md:text-[13px]",
        ENDS_IN_YEAR.test(text) &&
          "max-sm:px-2 max-sm:[&>span:first-child]:hidden",
      )}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="truncate">
        {text}
      </span>
    </GlassPill>
  );
}

export { DatedPill };
