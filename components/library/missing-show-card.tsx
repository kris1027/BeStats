"use client";

import { useOptimistic } from "react";

import { PosterCard } from "@/components/poster-card";
import { CardRoundButton } from "@/components/tracking/card-round-button";
import { PlannedIcon } from "@/components/tracking/tracking-icons";
import { useShowTracking } from "@/components/tracking/use-show-tracking";
import { typedHref } from "@/lib/catalog/media-type";
import { MISSING_SHOW_COPY } from "@/lib/tracking/messages";

import { neighbourCardTarget } from "./card-focus";
import { SHOW_CARD_LINK_SELECTOR } from "./ids";
import { MISSING_TITLE } from "./library-card";

/** The Watchlist shows tab, where every missing show card lives (AC-17). */
const RETURN_PATH = typedHref("/watchlist", "tv");

/**
 * Moves the focus off a card that is about to leave its grid: to a neighbour's
 * title link, or its button when it is another missing card with no link, else
 * `fallbackId`.
 */
function focusNeighbour(cardId: string, fallbackId: string) {
  const target = neighbourCardTarget(
    document.getElementById(cardId),
    `${SHOW_CARD_LINK_SELECTOR}, button`,
  );
  (target ?? document.getElementById(fallbackId))?.focus();
}

/**
 * A show on the Watchlist shows tab that TMDB no longer has (spec 0020,
 * AC-17): the "No longer on TMDB" card, with Stop tracking so the row can be
 * cleared, and the Undo every Stop tracking carries. The card hides at once
 * and comes back if the write fails.
 *
 * @param itemId The card's `li` id, for moving the focus to a neighbour.
 * @param fallbackId Where the focus goes when no card is left.
 */
function MissingShowCard({
  showId,
  itemId,
  fallbackId,
}: {
  showId: number;
  itemId: string;
  fallbackId: string;
}) {
  const [hidden, setHidden] = useOptimistic(false);
  const tracking = useShowTracking({
    showId,
    showName: MISSING_SHOW_COPY.toastName,
    returnPath: RETURN_PATH,
    toastId: `missing-show-${showId}`,
  });

  if (hidden) return null;

  return (
    <PosterCard
      title={MISSING_TITLE}
      posterUrl={null}
      controls={
        <CardRoundButton
          label={MISSING_SHOW_COPY.stopLabel}
          onClick={() => {
            focusNeighbour(itemId, fallbackId);
            tracking.untrack({ before: () => setHidden(true) });
          }}
          className="ml-auto"
        >
          <PlannedIcon className="size-4" />
        </CardRoundButton>
      }
    />
  );
}

export { MissingShowCard };
