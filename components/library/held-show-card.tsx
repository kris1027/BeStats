"use client";

import { cn } from "cn";
import { useOptimistic } from "react";
import { toast } from "sonner";

import { glassPillClassName } from "@/components/glass-pill";
import { PosterCard } from "@/components/poster-card";
import { CardRoundButton } from "@/components/tracking/card-round-button";
import { PlannedIcon } from "@/components/tracking/tracking-icons";
import { useShowTracking } from "@/components/tracking/use-show-tracking";
import { typedHref } from "@/lib/catalog/media-type";
import {
  HELD_SHOWS_COPY,
  SHOW_TRACKING_COPY,
  SHOW_TRACKING_LABELS,
} from "@/lib/tracking/messages";
import type { ShowHold } from "@/lib/tracking/types";

import { HELD_SHOWS_SUMMARY_ID, showCardLinkId } from "./ids";
import { MISSING_TITLE } from "./library-card";

/** The Watchlist shows tab, where every card here lives (AC-10, AC-17). */
const RETURN_PATH = typedHref("/watchlist", "tv");

/** What a held or missing card shows of its show. */
type CardTitle =
  | { kind: "found"; name: string; posterUrl: string | null }
  | { kind: "missing" }
  | { kind: "unavailable" };

/**
 * Moves the focus off a card that is about to leave its grid: to the next
 * card's first control, else the previous card's, else `fallbackId`.
 */
function focusNeighbour(cardId: string, fallbackId: string) {
  const item = document.getElementById(cardId);
  for (const neighbour of [
    item?.nextElementSibling,
    item?.previousElementSibling,
  ]) {
    const target = neighbour?.querySelector<HTMLElement>("h3 a, button");
    if (target) {
      target.focus();
      return;
    }
  }
  document.getElementById(fallbackId)?.focus();
}

/**
 * One paused or dropped show in the Paused & dropped section (spec 0020,
 * AC-10): the poster, the name, a Paused or Dropped label and Resume.
 *
 * Resume clears the hold over the hold this card showed (AC-4), and the
 * refresh moves the show to the page its progress gives it. A show whose
 * TMDB read failed keeps its footprint as "Show unavailable", and one TMDB no
 * longer has as "No longer on TMDB"; each keeps Resume and adds Stop
 * tracking, so the row can still be cleared. The card hides at once and
 * comes back if the write fails.
 *
 * @param itemId The card's `li` id, for moving the focus to a neighbour.
 */
function HeldShowCard({
  showId,
  hold,
  title,
  itemId,
}: {
  showId: number;
  hold: ShowHold;
  title: CardTitle;
  itemId: string;
}) {
  const [hidden, setHidden] = useOptimistic(false);
  const name = title.kind === "found" ? title.name : MISSING_TITLE;
  const tracking = useShowTracking({
    showId,
    showName: name,
    returnPath: RETURN_PATH,
    toastId: `held-show-${showId}`,
  });

  if (hidden) return null;

  function resume() {
    focusNeighbour(itemId, HELD_SHOWS_SUMMARY_ID);
    tracking.setHold(null, hold, {
      before: () => setHidden(true),
      after: (ok) => {
        if (ok) {
          toast(SHOW_TRACKING_COPY.resumed(name), {
            id: `held-show-${showId}`,
          });
        }
      },
    });
  }

  function stop() {
    focusNeighbour(itemId, HELD_SHOWS_SUMMARY_ID);
    tracking.untrack(hold, { before: () => setHidden(true) });
  }

  const label = SHOW_TRACKING_LABELS[hold];
  const resumeButton = (
    <button
      type="button"
      aria-label={HELD_SHOWS_COPY.resumeLabel(name)}
      onClick={resume}
      className={cn(
        glassPillClassName(),
        "h-11 cursor-pointer px-4 backdrop-blur-glass transition-[filter] hover:brightness-125 md:h-9 md:px-3.5",
      )}
    >
      {SHOW_TRACKING_COPY.resume}
    </button>
  );

  if (title.kind !== "found") {
    return (
      <PosterCard
        title={
          title.kind === "missing" ? MISSING_TITLE : HELD_SHOWS_COPY.unavailable
        }
        posterUrl={null}
        meta={label}
        controls={
          <>
            {resumeButton}
            <CardRoundButton
              label={HELD_SHOWS_COPY.stopLabel(name)}
              onClick={stop}
              className="ml-auto"
            >
              <PlannedIcon className="size-4" />
            </CardRoundButton>
          </>
        }
      />
    );
  }

  return (
    <PosterCard
      title={title.name}
      posterUrl={title.posterUrl}
      href={`/shows/${showId}`}
      linkId={showCardLinkId(showId)}
      meta={label}
      controls={resumeButton}
    />
  );
}

/**
 * A show on the Watchlist shows tab that TMDB no longer has (spec 0020,
 * AC-17): the "No longer on TMDB" card, with Stop tracking so the row can be
 * cleared, and the Undo every Stop tracking carries.
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
    showName: "this show",
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
          label={HELD_SHOWS_COPY.stopLabel("missing title")}
          onClick={() => {
            focusNeighbour(itemId, fallbackId);
            tracking.untrack(null, { before: () => setHidden(true) });
          }}
          className="ml-auto"
        >
          <PlannedIcon className="size-4" />
        </CardRoundButton>
      }
    />
  );
}

export { type CardTitle, HeldShowCard, MissingShowCard };
