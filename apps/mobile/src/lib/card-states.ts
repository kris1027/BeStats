import { V1_PAGE_SIZE } from "@bestats/core/api/v1/browse";
import {
  MAX_TITLE_KEYS,
  pickTitleState,
  type TitleType,
  titleKey,
  v1TitlesSchema,
} from "@bestats/core/api/v1/titles";
import { idsKey } from "@bestats/core/tracking/ids-key";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { apiRequest } from "./api";
import { PRIVATE_QUERY_ROOT } from "./query-client";
import { useSession } from "./session";
import { fetchTitleState, trackingKeys } from "./tracking";

/**
 * How many cards one state read covers: a loaded grid page, so scrolling to
 * the next page adds one read and never changes an earlier one's key
 * (prompts/mobile-look-card-actions.md, R6). It stays within the API's
 * `MAX_TITLE_KEYS`.
 */
export const CARD_STATE_CHUNK = Math.min(V1_PAGE_SIZE, MAX_TITLE_KEYS);

/** How long a seeded card state counts as fresh before a card reads it again. */
const CARD_STATE_STALE_MS = 60_000;

/** The batch read's key, under the private root so sign out wipes it. */
export const cardStatesKey = (type: TitleType, ids: readonly number[]) =>
  [PRIVATE_QUERY_ROOT, "titles", "cards", type, idsKey(ids)] as const;

/** The ids in fixed slices of `CARD_STATE_CHUNK`, in screen order. */
export function cardStateChunks(ids: readonly number[]): number[][] {
  const unique = [...new Set(ids)];
  const chunks: number[][] = [];
  for (let start = 0; start < unique.length; start += CARD_STATE_CHUNK) {
    chunks.push(unique.slice(start, start + CARD_STATE_CHUNK));
  }
  return chunks;
}

/**
 * The signed in user's state for every card on a screen
 * (prompts/mobile-look-card-actions.md, decision 5): one `/me/titles` read
 * per slice of cards, never one per card, each answer written into the
 * title's own key (`trackingKeys.title`), the key the title screens and the
 * card writes use, so a card and its title screen always agree.
 *
 * Returns whether one card's state is known. Signed out, loading or after a
 * failed read it is not, and the card stays the plain catalog card with no
 * menu (decision 6): a missing status on twenty cards is quieter than an
 * error, as on the web. A state with a write in flight is never overwritten
 * by a seed, so an older batch answer cannot undo an optimistic tap.
 */
export function useCardStates(
  type: TitleType,
  ids: readonly number[],
): (id: number) => boolean {
  const { session } = useSession();
  const queries = useQueryClient();
  const chunks = useMemo(() => cardStateChunks(ids), [ids]);

  const results = useQueries({
    queries: chunks.map((chunk) => ({
      queryKey: cardStatesKey(type, chunk),
      enabled: session !== null,
      staleTime: CARD_STATE_STALE_MS,
      queryFn: async () => {
        const titles = await apiRequest(
          `/api/v1/me/titles?ids=${chunk.map((id) => titleKey(type, id)).join(",")}`,
          v1TitlesSchema,
          { auth: true },
        );
        for (const id of chunk) {
          const state = pickTitleState(titles, type, id);
          const key = trackingKeys.title(type, id);
          if (state === null) continue;
          if (queries.isMutating({ mutationKey: key }) > 0) continue;
          queries.setQueryData(key, state);
        }
        return chunk;
      },
    })),
  });

  const known = new Set<number>();
  results.forEach((result, index) => {
    if (result.isSuccess) for (const id of chunks[index] ?? []) known.add(id);
  });
  return (id) => session !== null && known.has(id);
}

/**
 * One card's state, read from the title's own key that `useCardStates`
 * seeded. It reads by itself only once its batch has answered (`known`), so
 * a screen of cards never sends one request per card; after a write
 * invalidates the key, this is what reads the confirmed state again.
 * Undefined while unknown, signed out or unreadable.
 */
export function useCardState<T extends TitleType>(
  type: T,
  id: number,
  known: boolean,
) {
  return useQuery({
    queryKey: trackingKeys.title(type, id),
    queryFn: () => fetchTitleState(type, id),
    enabled: known,
    staleTime: CARD_STATE_STALE_MS,
  }).data;
}
