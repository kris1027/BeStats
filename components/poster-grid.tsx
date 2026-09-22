import { cn } from "cn";
import type * as React from "react";

/**
 * The poster grid, mobile first (spec 0004, AC-9).
 *
 * Column counts are fixed here and mirrored by `POSTER_SIZES` in
 * `poster-card.tsx`; changing one without the other ships wrong sized images.
 * Two columns at 390px keeps a poster wide enough to read its caption with no
 * horizontal page scroll, which is the narrow case the references never draw.
 *
 * A `<ul>` rather than a bare div: a collection of titles is a list, and that
 * is what tells a screen reader how many results there are.
 */
function PosterGrid({
  className,
  children,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="poster-grid"
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
        className,
      )}
      {...props}
    >
      {children}
    </ul>
  );
}

export { PosterGrid };
