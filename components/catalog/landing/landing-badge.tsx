import type * as React from "react";
import { Suspense } from "react";

import { IgdbRatingBadge, TmdbRatingBadge } from "@/components/rating-badges";
import { GameTrackingSlot } from "@/components/tracking/game-tracking-slot";
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
import { CATALOG_PATHS, type LibraryType } from "@/lib/catalog/media-type";

import type { LandingItem } from "./landing-items";

type Ids = readonly number[];

/**
 * Each media type's personal slots, the one place the landing branches on a
 * title's type to pick a component (prompts/landing-review-fixes.md,
 * decision 7). Every entry takes a `LandingItem`, so the cards and the hero
 * never name a show, movie or game slot themselves. A game has no card badge
 * or controls until G8, so those are null (spec 0028, AC-8).
 */
const LANDING_SLOTS: Record<
  LibraryType,
  {
    badge: ((item: LandingItem, ids: Ids) => React.ReactNode) | null;
    controls:
      | ((item: LandingItem, ids: Ids, releasePill: boolean) => React.ReactNode)
      | null;
    tracking: (item: LandingItem) => React.ReactNode;
  }
> = {
  tv: {
    badge: (item, ids) => (
      <ShowCardBadge
        showId={item.id}
        tmdbRating={item.rating.value}
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
        tmdbRating={item.rating.value}
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
  game: {
    badge: null,
    controls: null,
    tracking: (item) => (
      <GameTrackingSlot
        gameId={item.id}
        name={item.title}
        releaseDate={item.releaseDate}
      />
    ),
  },
};

/**
 * A title's community rating, labelled with the catalog it came from: TMDB's
 * for a show or movie, IGDB's for a game (spec 0028; AGENTS.md section 9).
 */
function CommunityRatingBadge({ rating }: { rating: LandingItem["rating"] }) {
  return rating.source === "igdb" ? (
    <IgdbRatingBadge value={rating.value} />
  ) : (
    <TmdbRatingBadge value={rating.value} />
  );
}

/**
 * A landing card's badge (prompts/home-parallax-landing.md, decision 5): the
 * TMDB rating at once, swapped for the personal state the title's library
 * page gives it once the session read arrives, as on every catalog card
 * (prompts/catalog-card-status.md). `ids` is the whole section, so its badges
 * share one read. A game shows only IGDB's rating, with no session read and
 * no Suspense, until G8 gives game cards a status (spec 0028, AC-8).
 */
function LandingBadge({ item, ids }: { item: LandingItem; ids: Ids }) {
  const badge = LANDING_SLOTS[item.mediaType].badge;
  const rating = <CommunityRatingBadge rating={item.rating} />;
  if (badge === null) return rating;
  return <Suspense fallback={rating}>{badge(item, ids)}</Suspense>;
}

/**
 * A landing card's bottom row (prompts/landing-card-controls.md): the plan or
 * track bookmark and, on an Upcoming title, its date pill, as the catalog
 * cards have. Its own Suspense with no fallback, so the artwork never waits
 * on the session, and the same `ids` as the badge, so both share one read.
 * A visitor gets nothing, as everywhere else. The return path is the landing
 * the card sits on. `releasePill` is false on a card that already prints a
 * movie's date (prompts/landing-review-fixes.md, decision 3). A game card
 * has no controls yet, so nothing at all (spec 0028, AC-8).
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
  const controls = LANDING_SLOTS[item.mediaType].controls;
  if (controls === null) return null;
  return (
    <Suspense fallback={null}>{controls(item, ids, releasePill)}</Suspense>
  );
}

/**
 * The hero's tracking control (decision 4): the title page's own slot, which
 * handles a signed out visitor and the release gate, in a Suspense with no
 * fallback so the hero never waits on the session. A game gets the game
 * page's status control, with its release gate (spec 0028, AC-7).
 */
function LandingTracking({ item }: { item: LandingItem }) {
  return (
    <Suspense fallback={null}>
      {LANDING_SLOTS[item.mediaType].tracking(item)}
    </Suspense>
  );
}

export { CommunityRatingBadge, LandingBadge, LandingControls, LandingTracking };
