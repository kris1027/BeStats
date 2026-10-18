import type * as React from "react";
import { Suspense } from "react";

import { TmdbRatingBadge } from "@/components/rating-badges";
import {
  MovieCardBadge,
  MovieCardControls,
} from "@/components/tracking/movie-card-slots";
import { MovieTrackingSlot } from "@/components/tracking/movie-tracking-slot";
import {
  ShowCardBadge,
  ShowCardControls,
} from "@/components/tracking/show-card-slots";
import { ShowTrackingSlot } from "@/components/tracking/show-tracking-slot";
import { CATALOG_PATHS, type MediaType } from "@/lib/catalog/media-type";

import type { LandingItem } from "./landing-items";

type Ids = readonly number[];

/**
 * Each media type's personal slots, the one place the landing branches on a
 * title's type to pick a component (prompts/landing-review-fixes.md,
 * decision 7). Every entry takes a `LandingItem`, so the cards and the hero
 * never name a show or movie slot themselves.
 */
const LANDING_SLOTS: Record<
  MediaType,
  {
    badge: (item: LandingItem, ids: Ids) => React.ReactNode;
    controls: (
      item: LandingItem,
      ids: Ids,
      releasePill: boolean,
    ) => React.ReactNode;
    tracking: (item: LandingItem) => React.ReactNode;
  }
> = {
  tv: {
    badge: (item, ids) => (
      <ShowCardBadge
        showId={item.id}
        tmdbRating={item.tmdbRating}
        gridShowIds={ids}
      />
    ),
    controls: (item, ids) => (
      <ShowCardControls
        showId={item.id}
        name={item.title}
        gridShowIds={ids}
        returnPath={CATALOG_PATHS.tv}
      />
    ),
    tracking: (item) => (
      <ShowTrackingSlot showId={item.id} showName={item.title} />
    ),
  },
  movie: {
    badge: (item, ids) => (
      <MovieCardBadge
        movieId={item.id}
        releaseDate={item.releaseDate}
        tmdbRating={item.tmdbRating}
        gridMovieIds={ids}
      />
    ),
    controls: (item, ids, releasePill) => (
      <MovieCardControls
        movieId={item.id}
        title={item.title}
        releaseDate={item.releaseDate}
        gridMovieIds={ids}
        returnPath={CATALOG_PATHS.movie}
        releasePill={releasePill}
      />
    ),
    tracking: (item) => (
      <MovieTrackingSlot
        movieId={item.id}
        title={item.title}
        releaseDate={item.releaseDate}
      />
    ),
  },
};

/**
 * A landing card's badge (prompts/home-parallax-landing.md, decision 5): the
 * TMDB rating at once, swapped for the personal state the title's library
 * page gives it once the session read arrives, as on every catalog card
 * (prompts/catalog-card-status.md). `ids` is the whole section, so its badges
 * share one read.
 */
function LandingBadge({ item, ids }: { item: LandingItem; ids: Ids }) {
  return (
    <Suspense fallback={<TmdbRatingBadge value={item.tmdbRating} />}>
      {LANDING_SLOTS[item.mediaType].badge(item, ids)}
    </Suspense>
  );
}

/**
 * A landing card's bottom row (prompts/landing-card-controls.md): the plan or
 * track bookmark and, on an Upcoming title, its date pill, as the catalog
 * cards have. Its own Suspense with no fallback, so the artwork never waits
 * on the session, and the same `ids` as the badge, so both share one read.
 * A visitor gets nothing, as everywhere else. The return path is the landing
 * the card sits on. `releasePill` is false on a card that already prints a
 * movie's date (prompts/landing-review-fixes.md, decision 3).
 */
function LandingControls({
  item,
  ids,
  releasePill = true,
}: {
  item: LandingItem;
  ids: Ids;
  releasePill?: boolean;
}) {
  return (
    <Suspense fallback={null}>
      {LANDING_SLOTS[item.mediaType].controls(item, ids, releasePill)}
    </Suspense>
  );
}

/**
 * The hero's tracking control (decision 4): the title page's own slot, which
 * handles a signed out visitor and the release gate, in a Suspense with no
 * fallback so the hero never waits on the session.
 */
function LandingTracking({ item }: { item: LandingItem }) {
  return (
    <Suspense fallback={null}>
      {LANDING_SLOTS[item.mediaType].tracking(item)}
    </Suspense>
  );
}

export { LandingBadge, LandingControls, LandingTracking };
