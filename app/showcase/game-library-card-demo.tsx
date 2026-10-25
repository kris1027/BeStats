"use client";

import { GameLibraryCard } from "@/components/library/game-library-card";
import type { LibraryGameItem } from "@/components/library/types";
import { PosterGrid } from "@/components/poster-grid";

/**
 * Every state of the game library card (spec 0027, AC-17), for `/showcase`.
 * A client module only because the card's remove button takes an `onClick`,
 * which a Server Component cannot hand to a DOM element; the demo does
 * nothing on a tap.
 */
export function GameLibraryCardDemo({ poster }: { poster: string }) {
  const base: LibraryGameItem = {
    gameId: 1,
    name: "",
    coverUrl: poster,
    communityRating: 8.4,
    rating: null,
    hidden: false,
    unreleased: null,
    dateLine: null,
  };
  const cards: { item: LibraryGameItem }[] = [
    { item: { ...base, name: "Want to play, released" } },
    {
      item: {
        ...base,
        name: "Want to play, coming soon",
        communityRating: null,
        unreleased: {
          date: { shortDate: "Feb 3, 2027", fullDate: "Feb 3, 2027" },
        },
      },
    },
    {
      item: {
        ...base,
        name: "Want to play, Date TBA",
        coverUrl: null,
        communityRating: null,
        unreleased: { date: null },
      },
    },
    {
      item: {
        ...base,
        name: "Playing, scored",
        rating: 9,
        dateLine: "Started Feb 2026",
      },
    },
    {
      item: {
        ...base,
        name: "Playing, not scored",
        dateLine: "Started Oct 2026",
      },
    },
    {
      item: {
        ...base,
        name: "Finished, scored",
        rating: 7,
        dateLine: "Finished Mar 2026",
      },
    },
    {
      item: {
        ...base,
        name: "Hidden by IGDB, no link",
        hidden: true,
        dateLine: "Finished Jan 2025",
      },
    },
    { item: { ...base, name: null, coverUrl: null, communityRating: null } },
  ];

  return (
    <PosterGrid>
      {cards.map(({ item }, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed demo list with no identity.
        <li key={index}>
          <GameLibraryCard item={item} onRemove={() => {}} />
        </li>
      ))}
    </PosterGrid>
  );
}
