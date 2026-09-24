import { cn } from "cn";
import { FilmIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type * as React from "react";

/**
 * The `sizes` string that matches the grid in `PosterGrid`.
 *
 * Kept next to the card rather than in the grid because `next/image` needs it
 * on the image, and kept as one constant because a grid change that misses it
 * silently ships the wrong image width to every screen (spec 0004, AC-8).
 * Mirrors the AC-9 column counts: 2 at base, 3 at sm, 4 at md, 5 at lg, 6 at
 * xl.
 */
const POSTER_SIZES =
  "(min-width: 1280px) 16vw, (min-width: 1024px) 20vw, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw";

/**
 * The single most repeated element in `design/`: a 2:3 poster inside a rounded
 * frame with a gradient rim, a title caption underneath, and two slots the
 * tracking features fill later.
 *
 * The frame is `fill` inside an `aspect-2/3` container rather than fixed
 * pixels. Every poster artboard in `design/` is exported at a different scale,
 * so reading pixel dimensions out of them would bake one artboard's scale into
 * the build; an aspect ratio survives that (AC-8).
 *
 * The rim is drawn on a decorative overlay, not on the frame. The two layer
 * background technique paints the rim as a background layer, which would sit
 * underneath the `<img>` and disappear.
 */
function PosterCard({
  title,
  posterUrl,
  href,
  badge,
  controls,
  meta,
  priority = false,
  className,
}: {
  title: string;
  /** Absolute TMDB URL from `imageUrl` in `lib/tmdb/images.ts`, or null. */
  posterUrl: string | null;
  /**
   * Where the card leads. Left out only for a title TMDB no longer has
   * (spec 0008, AC-11): there is no page to open, so the caption is plain text
   * and the card has no link at all.
   */
  href?: string;
  /** Top right slot, typically a `TmdbRatingBadge`. */
  badge?: React.ReactNode;
  /** Bottom row slot for the tracking controls features 8 and 12 add. */
  controls?: React.ReactNode;
  /**
   * A one line caption under the title, such as a season card's year and
   * episode count (spec 0009, AC-7). Outside the link, so the link's name
   * stays the title.
   */
  meta?: React.ReactNode;
  priority?: boolean;
  className?: string;
}) {
  return (
    <article className={cn("group relative flex flex-col gap-2.5", className)}>
      <div className="relative aspect-2/3 w-full overflow-hidden rounded-lg">
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt=""
            fill
            sizes={POSTER_SIZES}
            priority={priority}
            className="object-cover transition-[filter] duration-200 group-hover:brightness-110"
          />
        ) : (
          /*
           * The missing poster fallback. It occupies an identical footprint to
           * a real poster so a grid with some artwork missing does not shift,
           * and it repeats the title rather than inventing a placeholder
           * image (AGENTS.md section 3, AC-8).
           *
           * Flat plate, no glass gradient. `design/` only ever puts glass on
           * short surfaces; stretched over a 2:3 frame the same gradient reads
           * as a deliberate ramp rather than a quiet absence, which is the
           * opposite of what a missing poster should say.
           */
          <div
            data-slot="poster-fallback"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-glass-plate p-4 text-center"
          >
            <FilmIcon
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            {/*
             * Hidden from assistive technology on purpose. The caption link
             * below already carries the title, so leaving this readable makes
             * a screen reader announce it twice on every card with no artwork.
             */}
            <span
              aria-hidden="true"
              className="line-clamp-3 text-xs text-muted-foreground"
            >
              {title}
            </span>
          </div>
        )}

        <span
          aria-hidden="true"
          className="rim glass-rim pointer-events-none absolute inset-0 rounded-lg"
        />

        {/*
         * The badge and the control row sit above the card wide link overlay
         * below, so a tracking control stays clickable while the rest of the
         * card navigates. Blur is applied here and nowhere else on the card:
         * these are the only pieces that overlap artwork (AC-16).
         *
         * The control row spans the full poster width, so it lets clicks pass
         * through and only its children catch them. Otherwise the empty space
         * between and around the controls would swallow clicks meant for the
         * link.
         */}
        {badge ? (
          <div className="absolute top-2.5 right-2.5 z-20 rounded-full backdrop-blur-glass">
            {badge}
          </div>
        ) : null}

        {controls ? (
          <div className="absolute inset-x-2.5 bottom-2.5 z-20 flex pointer-events-none items-center justify-between gap-2 *:pointer-events-auto">
            {controls}
          </div>
        ) : null}
      </div>

      <h3 className="text-sm leading-snug text-foreground">
        {href ? (
          <Link href={href} className="rounded-sm hover:underline">
            {/*
             * The link covers the poster as well as the caption, so the whole
             * card is clickable while the accessible name stays the title and
             * the tab stop count stays one. The controls above sit on top of
             * it.
             */}
            <span className="absolute inset-0 z-10" aria-hidden="true" />
            {title}
          </Link>
        ) : (
          title
        )}
      </h3>
      {meta ? (
        <p className="-mt-1.5 truncate text-xs text-muted-foreground">{meta}</p>
      ) : null}
    </article>
  );
}

export { POSTER_SIZES, PosterCard };
