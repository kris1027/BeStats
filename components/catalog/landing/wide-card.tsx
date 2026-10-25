import Image from "next/image";
import Link from "next/link";
import type * as React from "react";

import { ArtFallback } from "./art-fallback";
import type { LandingItem } from "./landing-items";
import { WIDE_CARD_CLASS } from "./landing-skeletons";

const CARD_SIZES = "(min-width: 768px) 340px, 260px";

/**
 * A wide card: the backdrop (a game's IGDB art), or the poster cropped to
 * fill, or the flat missing image plate (decision 10; spec 0028, AC-8), with
 * the title and date over a shade at the bottom. The whole card is the
 * title's link; the badge and, top left, the controls sit above it
 * (prompts/landing-card-controls.md). The control row lets clicks through
 * between its children, as `PosterCard`'s does.
 *
 * Kept apart from the slots that read the session, so `/showcase` can draw
 * it with a plain badge.
 */
function WideCardView({
  item,
  label,
  badge,
  controls,
}: {
  item: Pick<LandingItem, "title" | "href" | "backdropUrl" | "posterUrl">;
  label: string | null;
  badge: React.ReactNode;
  controls?: React.ReactNode;
}) {
  const src = item.backdropUrl ?? item.posterUrl;
  return (
    <article
      className={`group relative overflow-hidden rounded-lg ${WIDE_CARD_CLASS}`}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          sizes={CARD_SIZES}
          className="object-cover transition-[filter] duration-200 group-hover:brightness-110"
        />
      ) : (
        <ArtFallback />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-t from-background/85 to-transparent to-60%"
      />
      <span
        aria-hidden="true"
        className="rim glass-rim pointer-events-none absolute inset-0 rounded-lg"
      />
      <div className="plate-solid absolute top-2.5 right-2.5 z-20 rounded-full backdrop-blur-glass">
        {badge}
      </div>
      {/* `empty:hidden`: a visitor's controls render nothing, so no plate. */}
      <div className="plate-solid pointer-events-none absolute top-2.5 left-2.5 z-20 flex items-center gap-2 empty:hidden *:pointer-events-auto">
        {controls}
      </div>
      <div className="absolute inset-x-4 bottom-3.5 flex items-end justify-between gap-3">
        <h3 className="line-clamp-2 text-base leading-snug font-semibold text-foreground">
          <Link href={item.href} className="rounded-sm hover:underline">
            <span className="absolute inset-0 z-10" aria-hidden="true" />
            {item.title}
          </Link>
        </h3>
        {label ? (
          <span className="shrink-0 text-xs whitespace-nowrap text-text-secondary">
            {label}
          </span>
        ) : null}
      </div>
    </article>
  );
}

export { WideCardView };
