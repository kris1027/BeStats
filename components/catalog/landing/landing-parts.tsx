import { cn } from "cn";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import type * as React from "react";

import { PosterCard } from "@/components/poster-card";
import { type CatalogList, listPath } from "@/lib/catalog/lists";

import { LandingBadge, LandingControls } from "./landing-badge";
import type { LandingItem } from "./landing-items";

/** A landing section's h2, larger than a row title (the design's 32 to 56px). */
const SECTION_HEADING_CLASS =
  "text-3xl leading-none font-bold tracking-[-0.03em] text-foreground md:text-[clamp(2rem,4vw,3.5rem)]";

/** The small uppercase label over a heading, as the design's "IN CINEMAS". */
const SECTION_LABEL_CLASS =
  "text-xs font-medium tracking-[0.1em] text-muted-foreground uppercase";

/** The id a section's h2 carries, so the section is named by it. */
function headingId(list: CatalogList): string {
  return `landing-${list.slug}`;
}

/** A section's See all link to its list page, as the old rows had (AC-9). */
function SeeAllLink({
  list,
  className,
}: {
  list: CatalogList;
  className?: string;
}) {
  return (
    <Link
      href={listPath(list)}
      aria-label={`See all ${list.rowTitle}`}
      className={cn(
        "hit-area inline-flex shrink-0 items-center gap-1 rounded-sm text-sm text-text-link hover:text-foreground",
        className,
      )}
    >
      See all
      <ChevronRightIcon className="size-4" aria-hidden="true" />
    </Link>
  );
}

/** A section's heading row: the h2 and See all, baseline aligned. */
function SectionHeader({
  list,
  aside,
}: {
  list: CatalogList;
  /** Replaces See all, for the pinned row's scroll hint on wide screens. */
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 id={headingId(list)} className={SECTION_HEADING_CLASS}>
        {list.rowTitle}
      </h2>
      {aside ?? <SeeAllLink list={list} />}
    </div>
  );
}

/**
 * A landing poster: the shared `PosterCard` with the section's badge and the
 * card controls (decision 5, amended by prompts/landing-card-controls.md).
 * `drift` marks the artwork for the poster parallax.
 */
function LandingPoster({
  item,
  ids,
  sizes,
  priority = false,
  drift = true,
}: {
  item: LandingItem;
  ids: readonly number[];
  sizes: string;
  priority?: boolean;
  drift?: boolean;
}) {
  return (
    <div
      data-poster-drift={drift ? "" : undefined}
      suppressHydrationWarning
      className={drift ? "poster-drift" : undefined}
    >
      <PosterCard
        title={item.title}
        posterUrl={item.posterUrl}
        href={item.href}
        badge={<LandingBadge item={item} ids={ids} />}
        controls={<LandingControls item={item} ids={ids} />}
        priority={priority}
        sizes={sizes}
      />
    </div>
  );
}

export {
  headingId,
  LandingPoster,
  SECTION_HEADING_CLASS,
  SECTION_LABEL_CLASS,
  SectionHeader,
  SeeAllLink,
};
