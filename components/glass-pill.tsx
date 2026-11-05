import { cn } from "cn";
import type * as React from "react";

/** The two pill tones. */
type GlassPillTone = "neutral" | "score";

/**
 * The pill recipe, without a size: plate, glass and rim, fully rounded, bold
 * 13px text.
 *
 * Exported so the tracking buttons in `components/tracking/` wear exactly the
 * same shell as the badges at a touch friendly height, instead of deriving the
 * recipe a second time and drifting from it (spec 0007, movie page row).
 *
 * @param tone `score` is the personal rating look; see `GlassPill`.
 */
function glassPillClassName(tone: GlassPillTone = "neutral"): string {
  return cn(
    "glass glass-shadow inline-flex items-center gap-1.5 rounded-full text-[13px] leading-none font-bold text-foreground",
    tone === "score"
      ? "glass-rim-score glass-plate-score"
      : "glass-rim glass-plate",
  );
}

/**
 * The badge shell: plate, then glass, then rim, fully rounded.
 *
 * Geometry taken from the rating badge on the poster card, which spec 0004
 * names the canonical pill (AC-10). The badge legend shows the same marks with
 * no pill at all, so it is the source for icons and colours only, never for
 * shape.
 *
 * The opaque plate is applied here rather than left to the caller. A pill is
 * the one surface in this system that routinely lands on poster artwork, and
 * glass over a light poster drops near white text to 1.59:1. Owning the plate
 * at the component is what makes the rule enforceable (AC-5).
 */
function GlassPill({
  icon,
  tone = "neutral",
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & {
  icon?: React.ReactNode;
  /**
   * `score` is the personal rating badge: its own darker plate and a cyan rim,
   * which is the only coloured rim in the system. It exists so a personal
   * score is never mistaken for a TMDB community rating (AGENTS.md section 9).
   */
  tone?: GlassPillTone;
}) {
  return (
    <span
      data-slot="glass-pill"
      className={cn(glassPillClassName(tone), "h-7 px-2.5", className)}
      {...props}
    >
      {icon ? (
        <span className="flex shrink-0 items-center [&_svg]:size-3.5">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}

/**
 * The size of every pill in a poster card's bottom row: the date and Date TBA
 * pills, the next episode pill and the Playing or Finished chip. Mobile
 * first, 32px with 11px text on phones, where a two column card is about
 * 165px wide, and 36px with 13px text from `md`. One class so the pills on
 * different cards never drift apart (root AGENTS.md section 3;
 * prompts/upcoming-date-pill-wrap.md, decision 8). It never shrinks, so a
 * date is never cut. No blur of its own: the pills sit in the card's
 * `plate-solid` slot, whose plates are opaque (components/AGENTS.md,
 * Backdrop blur).
 */
const CARD_PILL =
  "h-8 shrink-0 px-2.5 text-[11px] md:h-9 md:px-3 md:text-[13px]";

export { CARD_PILL, GlassPill, type GlassPillTone, glassPillClassName };
