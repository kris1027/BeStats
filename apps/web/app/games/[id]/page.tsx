import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { JsonLd } from "@/components/catalog/json-ld";
import { GameDetailSkeleton } from "@/components/game/game-detail-skeleton";
import { GameFacts } from "@/components/game/game-facts";
import { GameHero } from "@/components/game/game-hero";
import { GameMoreLikeThisSection } from "@/components/game/game-more-like-this";
import { GameOverview } from "@/components/game/game-overview";
import { ScreenshotGallery } from "@/components/game/screenshot-gallery";
import { RetryLink } from "@/components/retry-link";
import { StatePanel } from "@/components/state-panel";
import { GameTrackingSlot } from "@/components/tracking/game-tracking-slot";
import { parseGameId } from "@/lib/catalog/ids";
import { gameHref } from "@/lib/catalog/media-type";
import { truncateAtWord } from "@/lib/format";
import { gameJsonLd } from "@/lib/seo/json-ld";
import { catalogMetadata } from "@/lib/seo/metadata";

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
 * (spec 0025, AC-10), plus the canonical and share card of spec 0032, AC-1.
 *
 * Only a found, visible game is indexable. The not found branch sets
 * `noindex` itself because the status is already 200 when the body decides
 * (a soft 404, spec 0025, AC-7), and the failed branch has it so an IGDB
 * outage never gets a retry panel indexed (AC-8; spec 0032, AC-2). The
 * canonical is built from the id alone, so a query string never reaches it.
 *
 * The share image prefers the wide art, then a screenshot, then the cover,
 * because a share card is 1200 by 630 and a portrait cover crops badly; the
 * movie page's backdrop first rule (spec 0032, rationale).
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

  const { name, releaseYear, summary, artUrl, screenshotUrls, coverUrl } =
    result.game;
  return catalogMetadata({
    title: releaseYear === null ? name : `${name} (${releaseYear})`,
    description:
      summary === null ? undefined : truncateAtWord(summary, DESCRIPTION_LIMIT),
    path: gameHref(id),
    image: artUrl ?? screenshotUrls[0] ?? coverUrl,
    ogType: "website",
  });
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
 * (AC-9). The status control reads the session in its own Suspense boundary
 * through the hero's `tracking` slot (spec 0026, AC-1).
 *
 * The found branch, and only it, carries the `VideoGame` JSON-LD (spec 0032,
 * AC-3), so a missing, hidden or failed game never describes itself.
 *
 * Spec 0031 adds the backdrop and Trailer button to the hero, then Overview,
 * Screenshots, More like this and Facts, in that order (AC-1). All but More
 * like this come from the one `getGame` read; that section streams its own
 * batch read in its own boundary (AC-8).
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
          action={<RetryLink href={gameHref(id)} />}
        />
      </div>
    );
  }

  const { game } = result;

  return (
    <article className="flex flex-col gap-10 md:gap-14">
      <JsonLd data={gameJsonLd(game)} />
      <GameHero
        name={game.name}
        coverUrl={game.coverUrl}
        releaseDate={game.releaseDate}
        gameType={game.gameType}
        genres={game.genres}
        platforms={game.platforms}
        communityRating={game.communityRating}
        communityRatingCount={game.communityRatingCount}
        artUrl={game.artUrl}
        trailer={game.trailer}
        tracking={
          <Suspense fallback={null}>
            <GameTrackingSlot
              gameId={id}
              name={game.name}
              releaseDate={game.releaseDate}
            />
          </Suspense>
        }
      />
      <GameOverview
        summary={game.summary}
        storyline={game.storyline}
        developers={game.developers}
        publishers={game.publishers}
      />
      <ScreenshotGallery
        name={game.name}
        screenshotUrls={game.screenshotUrls}
      />
      <GameMoreLikeThisSection
        gameId={id}
        similarGameIds={game.similarGameIds}
      />
      <GameFacts
        gameModes={game.gameModes}
        playerPerspectives={game.playerPerspectives}
        themes={game.themes}
        franchises={game.franchises}
        series={game.series}
        gameEngines={game.gameEngines}
        platformReleases={game.platformReleases}
      />
    </article>
  );
}
