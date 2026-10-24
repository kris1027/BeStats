import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { GameDetailSkeleton } from "@/components/game/game-detail-skeleton";
import { GameHero } from "@/components/game/game-hero";
import { RetryLink } from "@/components/retry-link";
import { StatePanel } from "@/components/state-panel";
import { parseGameId } from "@/lib/catalog/ids";
import { truncateAtWord } from "@/lib/format";

import { loadGame } from "./load-game";

/** Longest meta description the page emits, the movie page's limit. */
const DESCRIPTION_LIMIT = 160;

/** A malformed id and an unknown or hidden game share one not found title. */
const NOT_FOUND_METADATA: Metadata = {
  title: "Game not found",
  robots: { index: false },
};

/**
 * The tab title and description, from the same `loadGame` the body uses
 * (spec 0025, AC-10).
 *
 * Every branch is `noindex` until G10 turns indexing on for games, so no
 * canonical, share card or JSON-LD yet. The not found branch sets it itself
 * because the status is already 200 when the body decides (a soft 404,
 * AC-7), and the failed branch has it so an IGDB outage never gets a retry
 * panel indexed (AC-8).
 */
export async function generateMetadata({
  params,
}: PageProps<"/games/[id]">): Promise<Metadata> {
  const id = parseGameId((await params).id);
  if (id === null) return NOT_FOUND_METADATA;

  const result = await loadGame(id);
  if (result.kind === "not_found") return NOT_FOUND_METADATA;
  if (result.kind === "failed") {
    return { title: "Game", robots: { index: false } };
  }

  const { name, releaseYear, summary } = result.game;
  return {
    title: releaseYear === null ? name : `${name} (${releaseYear})`,
    description:
      summary === null ? undefined : truncateAtWord(summary, DESCRIPTION_LIMIT),
    robots: { index: false },
  };
}

/**
 * A public game page, the tracer of the games scope (spec 0025).
 *
 * The page itself is a static shell: only the Suspense boundary and its
 * skeleton, so navigation commits instantly and `pnpm build` prerenders it
 * without calling IGDB (AC-9). Everything that needs the id streams inside
 * the boundary.
 *
 * Nothing here reads a cookie, a header, the session or the visitor's region
 * (AC-9). G4 adds the status control in its own boundary through the hero's
 * `tracking` slot, and G9 adds the sections under the hero.
 */
export default function GamePage({ params }: PageProps<"/games/[id]">) {
  return (
    <Suspense fallback={<GameDetailSkeleton />}>
      <GameDetail params={params} />
    </Suspense>
  );
}

async function GameDetail({
  params,
}: {
  params: PageProps<"/games/[id]">["params"];
}) {
  // `proxy.ts` already answered a malformed id with a real 404; this is the
  // same rule again for any request that did not pass through it.
  const id = parseGameId((await params).id);
  if (id === null) notFound();

  const result = await loadGame(id);
  if (result.kind === "not_found") notFound();

  if (result.kind === "failed") {
    return (
      <div className="flex flex-1 flex-col justify-center py-12">
        <StatePanel
          variant="error"
          title="Couldn't reach IGDB"
          description="IGDB didn't respond. Try again in a moment."
          action={<RetryLink href={`/games/${id}`} />}
        />
      </div>
    );
  }

  const { game } = result;

  return (
    <article className="flex flex-col gap-10 md:gap-14">
      <GameHero
        name={game.name}
        coverUrl={game.coverUrl}
        releaseDate={game.releaseDate}
        gameType={game.gameType}
        genres={game.genres}
        platforms={game.platforms}
        communityRating={game.communityRating}
        communityRatingCount={game.communityRatingCount}
      />
    </article>
  );
}
