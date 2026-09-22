import { cn } from "cn";
import type * as React from "react";

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
  tone?: "neutral" | "score";
}) {
  return (
    <span
      data-slot="glass-pill"
      className={cn(
        "glass glass-shadow inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] leading-none font-bold text-foreground",
        tone === "score"
          ? "glass-rim-score glass-plate-score"
          : "glass-rim glass-plate",
        className,
      )}
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

export { GlassPill };
