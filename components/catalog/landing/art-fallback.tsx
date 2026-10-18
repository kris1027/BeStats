import { cn } from "cn";
import { FilmIcon } from "lucide-react";

/**
 * The flat missing artwork tile (decision 10) for the hero, the wide cards
 * and the top rated rows, filling its positioned box. It carries the same
 * `data-slot` as `PosterCard`'s fallback, so every missing image on the site
 * is found the same way, and never stands in an invented image.
 */
function ArtFallback({ iconClassName = "size-8" }: { iconClassName?: string }) {
  return (
    <div
      data-slot="poster-fallback"
      className="absolute inset-0 flex items-center justify-center bg-glass-plate"
    >
      <FilmIcon
        className={cn("text-muted-foreground", iconClassName)}
        aria-hidden="true"
      />
    </div>
  );
}

export { ArtFallback };
