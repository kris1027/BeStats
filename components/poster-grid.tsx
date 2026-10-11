import { cn } from "cn";
import type * as React from "react";

/**
 * The poster grid, mobile first (spec 0004, AC-9).
 *
 * Column counts are fixed here and mirrored by `POSTER_SIZES` in
 * `poster-card.tsx`; changing one without the other ships wrong sized images.
 * Two columns below `md`, four from it: a page holds 20 titles, which fills
 * every row at both counts (prompts/grid-tabs-footer-legend.md), where three
 * or five columns would leave a ragged last row. Two columns at 390px keeps a
 * poster wide enough to read its caption with no horizontal page scroll.
 *
 * The 1200px cap keeps a four column poster near 285px wide, so a full page
 * stays a sensible length on a wide screen; past the cap the grid is centred
 * on every page, under the centred pagination.
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
        "mx-auto grid w-full max-w-[1200px] grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4",
        className,
      )}
      {...props}
    >
      {children}
    </ul>
  );
}

export { PosterGrid };
