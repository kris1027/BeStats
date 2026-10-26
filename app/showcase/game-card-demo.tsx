"use client";

import { useState } from "react";

import { ReleasePill } from "@/components/library/dated-pill";
import { PosterCard } from "@/components/poster-card";
import { PosterGrid } from "@/components/poster-grid";
import {
  IgdbRatingBadge,
  PersonalScoreBadge,
} from "@/components/rating-badges";
import { CardRoundButton } from "@/components/tracking/card-round-button";
import { GameStatusChip } from "@/components/tracking/game-status-chip";
import { PlanIcon, PlannedIcon } from "@/components/tracking/tracking-icons";
import type { ReleaseDate } from "@/lib/format";
import type { StartedGameStatus } from "@/lib/tracking/types";

type DemoCard = {
  name: string;
  /** Undefined is a visitor: no bottom row at all (spec 0030, AC-9). */
  state?:
    | { kind: "bookmark"; pressed: boolean; release?: ReleaseDate }
    | {
        kind: "started";
        status: StartedGameStatus;
        rating: number | null;
      };
  year: number | null;
};

const CARDS: DemoCard[] = [
  { name: "Visitor", year: 2015 },
  {
    name: "No status",
    state: { kind: "bookmark", pressed: false },
    year: 2015,
  },
  {
    name: "Want to play, released",
    state: { kind: "bookmark", pressed: true },
    year: 2015,
  },
  {
    name: "Want to play, unreleased",
    state: {
      kind: "bookmark",
      pressed: true,
      release: { shortDate: "Feb 3, 2027", fullDate: "Feb 3, 2027" },
    },
    year: 2027,
  },
  {
    name: "Want to play, Date TBA",
    state: { kind: "bookmark", pressed: true, release: null },
    year: null,
  },
  {
    name: "Playing, scored",
    state: { kind: "started", status: "playing", rating: 9 },
    year: 2020,
  },
  {
    name: "Finished, unscored",
    state: { kind: "started", status: "finished", rating: null },
    year: 2018,
  },
];

/**
 * Every state of a catalog game card (spec 0030, AC-15), for `/showcase`:
 * the real badges, pill, chip and round button the slots render, without the
 * session read or the Server Action. The bookmark toggles here only, so the
 * keyboard path can be tried; a client module only for that state.
 */
export function GameCardDemo({ poster }: { poster: string }) {
  return (
    <PosterGrid>
      {CARDS.map((card) => (
        <li key={card.name}>
          <PosterCard
            title={card.name}
            posterUrl={card.year === null ? null : poster}
            href="/games"
            meta={card.year ?? undefined}
            badge={
              card.state?.kind === "started" && card.state.rating !== null ? (
                <PersonalScoreBadge value={card.state.rating} />
              ) : (
                <IgdbRatingBadge value={8.4} />
              )
            }
            controls={
              card.state === undefined ? undefined : card.state.kind ===
                "started" ? (
                <GameStatusChip status={card.state.status} />
              ) : (
                <DemoBookmark
                  name={card.name}
                  pressed={card.state.pressed}
                  release={card.state.release}
                />
              )
            }
          />
        </li>
      ))}
    </PosterGrid>
  );
}

function DemoBookmark({
  name,
  pressed: initial,
  release,
}: {
  name: string;
  pressed: boolean;
  release: ReleaseDate | undefined;
}) {
  const [pressed, setPressed] = useState(initial);
  return (
    <>
      {pressed && release !== undefined ? (
        <ReleasePill release={release} />
      ) : null}
      <CardRoundButton
        label={`Want to play: ${name}`}
        pressed={pressed}
        onClick={() => setPressed(!pressed)}
        className="ml-auto"
      >
        {pressed ? (
          <PlannedIcon className="size-4" />
        ) : (
          <PlanIcon className="size-4" />
        )}
      </CardRoundButton>
    </>
  );
}
