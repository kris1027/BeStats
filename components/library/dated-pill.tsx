import { cn } from "cn";

import { GlassPill } from "@/components/glass-pill";
import { CalendarIcon } from "@/components/tracking/tracking-icons";
import type { ReleaseDate } from "@/lib/format";
import { UPCOMING_MESSAGES } from "@/lib/tracking/messages";

/** A short date that carries its year, such as `Feb 3, 2027`. */
const ENDS_IN_YEAR = /\d{4}$/;

/** The pill's size, shared by the dated and Date TBA pills; never shrinks. */
const DATED_PILL =
  "h-8 shrink-0 px-2.5 text-[11px] backdrop-blur-glass md:h-9 md:px-3 md:text-[13px]";

/**
 * The calendar pill on the Upcoming page (spec 0014, AC-5, AC-12; spec 0020,
 * AC-11, AC-13): the
 * calendar glyph and a short date, smaller below `md` (32px, 11px text) than
 * above it.
 *
 * The pill never shrinks or cuts its date, glyph and year included at every
 * width (prompts/upcoming-date-pill-wrap.md). Where the card's button does
 * not fit beside it, `PosterCard` wraps the button above the pill, keyed on
 * `data-dated-pill`. The full date is also the accessible text.
 *
 * @param label The pill's accessible text, with the full date.
 * @param text What the pill prints.
 * @param phoneGlyphless For a pill alone in its row, which has no button to
 * move: the show card's `S12E10 · Feb 23, 2027` is wider than a 375px two
 * column card, so below `sm` a dated text with a year drops the glyph rather
 * than spill past the poster (owner, 2026-11-05).
 */
function DatedPill({
  slot,
  label,
  text,
  phoneGlyphless = false,
}: {
  slot: string;
  label: string;
  text: string;
  phoneGlyphless?: boolean;
}) {
  return (
    <GlassPill
      data-slot={slot}
      data-dated-pill=""
      icon={<CalendarIcon />}
      className={cn(
        DATED_PILL,
        phoneGlyphless &&
          ENDS_IN_YEAR.test(text) &&
          "max-sm:px-2 max-sm:[&>span:first-child]:hidden",
      )}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="whitespace-nowrap">
        {text}
      </span>
    </GlassPill>
  );
}

/**
 * The calendar pill with no date (spec 0020, AC-11, AC-13), the `DatedPill`
 * recipe with "Date TBA" in place of a date.
 *
 * @param label The pill's accessible text.
 */
function DateTbaPill({ label }: { label: string }) {
  return (
    <GlassPill
      data-slot="upcoming-date"
      data-dated-pill=""
      icon={<CalendarIcon />}
      className={DATED_PILL}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="whitespace-nowrap">
        {UPCOMING_MESSAGES.dateTba}
      </span>
    </GlassPill>
  );
}

/** The release date on an Upcoming movie card, or Date TBA (AC-13). */
function ReleasePill({ release }: { release: ReleaseDate }) {
  if (release === null) {
    return <DateTbaPill label={UPCOMING_MESSAGES.releaseTba} />;
  }
  return (
    <DatedPill
      slot="release-date"
      label={UPCOMING_MESSAGES.releases(release.fullDate)}
      text={release.shortDate}
    />
  );
}

export { DatedPill, DateTbaPill, ReleasePill };
