"use client";

import { GameLibraryCard } from "@/components/library/game-library-card";
import type { LibraryGameItem, LibraryList } from "@/components/library/types";
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
    release: { state: "released" },
    dateLine: null,
  };
  const cards: { list: LibraryList; item: LibraryGameItem }[] = [
    { list: "watchlist", item: { ...base, name: "Want to play, released" } },
    {
      list: "watchlist",
      item: {
        ...base,
        name: "Want to play, coming soon",
        communityRating: null,
        release: {
          state: "unreleased",
          date: { shortDate: "Feb 3, 2027", fullDate: "Feb 3, 2027" },
        },
      },
    },
    {
      list: "watchlist",
      item: {
        ...base,
        name: "Want to play, Date TBA",
        coverUrl: null,
        communityRating: null,
        release: { state: "unreleased", date: null },
      },
    },
    {
      list: "upcoming",
      item: {
        ...base,
        name: "Playing, scored",
        rating: 9,
        dateLine: "Started Feb 2026",
      },
    },
    {
      list: "upcoming",
      item: {
        ...base,
        name: "Playing, not scored",
        dateLine: "Started Oct 2026",
      },
    },
    {
      list: "watched",
      item: {
        ...base,
        name: "Finished, scored",
        rating: 7,
        dateLine: "Finished Mar 2026",
      },
    },
    {
      list: "watched",
      item: {
        ...base,
        name: "Hidden by IGDB, no link",
        hidden: true,
        dateLine: "Finished Jan 2025",
      },
    },
    {
      list: "watched",
      item: { ...base, name: null, coverUrl: null, communityRating: null },
    },
  ];

  return (
    <PosterGrid>
      {cards.map(({ list, item }, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed demo list with no identity.
        <li key={index}>
          <GameLibraryCard list={list} item={item} onRemove={() => {}} />
        </li>
      ))}
    </PosterGrid>
  );
}
