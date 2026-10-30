"use client";

import { GameLibraryCard } from "@/components/library/game-library-card";
import type { LibraryGameItem } from "@/components/library/types";
import { PosterGrid } from "@/components/poster-grid";
import type { LibraryPageKey } from "@/lib/catalog/library-list";

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
    status: "want_to_play",
    coverUrl: poster,
    communityRating: 8.4,
    rating: null,
    hidden: false,
    unreleased: null,
    dateLine: null,
  };
  const cards: { item: LibraryGameItem; list: LibraryPageKey }[] = [
    { list: "watchlist", item: { ...base, name: "Want to play, released" } },
    {
      list: "coming-soon",
      item: {
        ...base,
        name: "Coming soon, dated",
        communityRating: null,
        unreleased: {
          date: { shortDate: "Feb 3, 2027", fullDate: "Feb 3, 2027" },
        },
      },
    },
    {
      list: "coming-soon",
      item: {
        ...base,
        name: "Coming soon, Date TBA",
        coverUrl: null,
        communityRating: null,
        unreleased: { date: null },
      },
    },
    {
      list: "upcoming",
      item: {
        ...base,
        name: "Playing, scored",
        status: "playing",
        rating: 9,
        dateLine: "Started Feb 2026",
      },
    },
    {
      list: "upcoming",
      item: {
        ...base,
        name: "Playing, not scored",
        status: "playing",
        dateLine: "Started Oct 2026",
      },
    },
    {
      list: "watched",
      item: {
        ...base,
        name: "Finished, scored",
        status: "finished",
        rating: 7,
        dateLine: "Finished Mar 2026",
      },
    },
    {
      list: "watched",
      item: {
        ...base,
        name: "Hidden by IGDB, no link",
        status: "finished",
        hidden: true,
        dateLine: "Finished Jan 2025",
      },
    },
    {
      list: "watchlist",
      item: { ...base, name: null, coverUrl: null, communityRating: null },
    },
  ];

  return (
    <PosterGrid>
      {cards.map(({ item, list }, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed demo list with no identity.
        <li key={index}>
          <GameLibraryCard item={item} list={list} onRemove={() => {}} />
        </li>
      ))}
    </PosterGrid>
  );
}
