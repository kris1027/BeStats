import { cn } from "cn";
import { FilmIcon, StarIcon } from "lucide-react";
import Image from "next/image";

import type { QuickResult } from "@/lib/search/quick";

/**
 * One result row from `design/desktop-search-open.svg`: the poster, the title
 * over its year, and the TMDB rating on the right (spec 0010, AC-2).
 *
 * That artboard is exported at about 1.6 times CSS scale (its field is 85px
 * tall and its title is set at 29px), so every size here is the drawn one
 * divided by that factor rather than read off as pixels, the rule
 * `components/AGENTS.md` sets for posters. The poster keeps the drawn 2:3
 * frame.
 *
 * The year and the rating are simply absent when TMDB has neither, never a
 * placeholder. The star is amber because this is always TMDB's community
 * rating (AGENTS.md section 9).
 */
function QuickSearchRow({ result }: { result: QuickResult }) {
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
            className="plate-rim glass-rim glass-plate absolute inset-0 flex items-center justify-center rounded-md"
          >
            <FilmIcon
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

      {result.tmdbRating !== null ? (
        <span className="flex shrink-0 items-center gap-1.5 text-[15px] text-foreground tabular-nums">
          <StarIcon
            className="size-4 fill-rating-tmdb text-rating-tmdb"
            aria-hidden="true"
          />
          <span className="sr-only">TMDB rating </span>
          {result.tmdbRating.toFixed(1)}
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
      <div className="plate-rim glass-rim glass-plate skeleton-pulse aspect-2/3 w-[42px] shrink-0 rounded-md" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="plate-rim glass-rim glass-plate skeleton-pulse h-4 w-1/2 rounded-sm" />
        <div className="plate-rim glass-rim glass-plate skeleton-pulse h-3 w-12 rounded-sm" />
      </div>
    </div>
  );
}

export { QuickSearchRow, QuickSearchRowSkeleton };
