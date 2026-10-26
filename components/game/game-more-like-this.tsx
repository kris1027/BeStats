import { Suspense } from "react";

import {
  CarouselRowSkeleton,
  ROW_ITEM_CLASS,
  ROW_POSTER_SIZES,
  ROW_SIZE,
} from "@/components/catalog/carousel-row-states";
import { CatalogListCards } from "@/components/catalog/catalog-list-cards";
import { MoreLikeThisFrame } from "@/components/catalog/title-extras";
import { SectionErrorLine } from "@/components/catalog/title-section";
import { gameHref } from "@/lib/catalog/media-type";
import { type GameSummary, getGamesByIds, IgdbError } from "@/lib/igdb";

type MoreLikeThisProps = { gameId: number; similarGameIds: number[] };

/**
 * A game's More like this (spec 0031, AC-8): IGDB's similar games as home row
 * cards, through the same `CatalogListCards` as a games landing row, so each
 * card carries the G8 status badge and Want to play bookmark. It streams in
 * its own boundary, since it is the one section `getGame` cannot feed. With
 * no ids the section is left out without a skeleton.
 */
function GameMoreLikeThisSection(props: MoreLikeThisProps) {
  if (props.similarGameIds.length === 0) return null;
  return (
    <Suspense
      fallback={
        <MoreLikeThisFrame>
          <CarouselRowSkeleton />
        </MoreLikeThisFrame>
      }
    >
      <GameMoreLikeThisContent {...props} />
    </Suspense>
  );
}

/**
 * The section's body, exported apart from its boundary so tests can await it.
 * One cached batch read for every id; `found` has no promised order, so the
 * cards follow `similarGameIds`. Missing and hidden games are dropped before
 * the cap of 12, so a hidden game never costs a slot. Only an `IgdbError`
 * becomes the error line; anything else is a bug and is rethrown.
 */
async function GameMoreLikeThisContent({
  gameId,
  similarGameIds,
}: MoreLikeThisProps) {
  if (similarGameIds.length === 0) return null;

  let found: GameSummary[];
  try {
    ({ found } = await getGamesByIds(similarGameIds));
  } catch (error) {
    if (!(error instanceof IgdbError)) throw error;
    return (
      <MoreLikeThisFrame>
        <SectionErrorLine
          what="similar games"
          href={gameHref(gameId)}
          source="IGDB"
        />
      </MoreLikeThisFrame>
    );
  }

  const byId = new Map(found.map((game) => [game.id, game]));
  const results = similarGameIds
    .map((id) => byId.get(id))
    .filter((game): game is GameSummary => game !== undefined && !game.hidden)
    .slice(0, ROW_SIZE);
  if (results.length === 0) return null;

  return (
    <MoreLikeThisFrame>
      <ul className="flex gap-3 md:gap-4">
        <CatalogListCards
          result={{
            mediaType: "game",
            paged: {
              page: 1,
              results,
              hasNextPage: false,
              totalResults: results.length,
            },
          }}
          returnPath={gameHref(gameId)}
          eagerCount={0}
          limit={ROW_SIZE}
          sizes={ROW_POSTER_SIZES}
          itemClassName={ROW_ITEM_CLASS}
        />
      </ul>
    </MoreLikeThisFrame>
  );
}

export { GameMoreLikeThisContent, GameMoreLikeThisSection };
