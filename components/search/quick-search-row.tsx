import { cn } from "cn";
import {
  FilmIcon,
  Gamepad2Icon,
  type LucideIcon,
  StarIcon,
} from "lucide-react";
import Image from "next/image";

import { CATALOG_SOURCES } from "@/lib/catalog/media-type";
import type { SearchType } from "@/lib/search/params";
import type { QuickResult } from "@/lib/search/quick";

/** The icon a row with no poster or cover shows, per catalog. */
const FALLBACK_ICONS = {
  tv: FilmIcon,
  movie: FilmIcon,
  game: Gamepad2Icon,
} as const satisfies Record<SearchType, LucideIcon>;

/**
 * One result row in the quick search: the poster or cover, the title over its
 * year, and the community rating on the right (spec 0010, AC-2; spec 0029,
 * AC-16). Every row keeps the 2:3 frame the poster and game cards use; a
 * game with no cover shows the game icon.
 *
 * The year and the rating are simply absent when the catalog has neither,
 * never a placeholder. The star is amber because this is always TMDB's or
 * IGDB's community rating, named after its source (AGENTS.md section 9).
 */
function QuickSearchRow({
  result,
  type,
}: {
  result: QuickResult;
  type: SearchType;
}) {
  const FallbackIcon = FALLBACK_ICONS[type];
  return (
    <>
      <span className="relative aspect-2/3 w-[42px] shrink-0 overflow-hidden rounded-md">
        {result.posterUrl ? (
          <Image
            src={result.posterUrl}
            alt=""
            fill
            sizes="42px"
            className="object-cover"
          />
        ) : (
          <span
            data-slot="poster-fallback"
            className="plate-solid plate-rim glass-rim glass-plate absolute inset-0 flex items-center justify-center rounded-md"
          >
            <FallbackIcon
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          </span>
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[17px] leading-tight font-semibold text-foreground">
          {result.title}
        </span>
        {result.year !== null ? (
          <span className="text-sm tracking-[0.04em] text-muted-foreground tabular-nums">
            {result.year}
          </span>
        ) : null}
      </span>

      {result.rating !== null ? (
        <span className="flex shrink-0 items-center gap-1.5 text-[15px] text-foreground tabular-nums">
          <StarIcon
            className="size-4 fill-rating-tmdb text-rating-tmdb"
            aria-hidden="true"
          />
          <span className="sr-only">
            {CATALOG_SOURCES[type]} community rating{" "}
          </span>
          {result.rating.toFixed(1)}
        </span>
      ) : null}
    </>
  );
}

/** The loading shape of one row, at the row's exact footprint. */
function QuickSearchRowSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("flex items-center gap-4 px-3 py-2", className)}
    >
      <div className="plate-solid plate-rim glass-rim glass-plate skeleton-pulse aspect-2/3 w-[42px] shrink-0 rounded-md" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="plate-solid plate-rim glass-rim glass-plate skeleton-pulse h-4 w-1/2 rounded-sm" />
        <div className="plate-solid plate-rim glass-rim glass-plate skeleton-pulse h-3 w-12 rounded-sm" />
      </div>
    </div>
  );
}

export { QuickSearchRow, QuickSearchRowSkeleton };
