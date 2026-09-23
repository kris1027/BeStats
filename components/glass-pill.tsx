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
 * Geometry taken from the rating badge in `design/show-movie-card.svg`, which
 * spec 0004 names the canonical pill (AC-10). `design/badge-legend.svg` draws
 * the same marks with no pill at all, so it is the source for icons and
 * colours only, never for shape.
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

export { GlassPill, type GlassPillTone, glassPillClassName };
