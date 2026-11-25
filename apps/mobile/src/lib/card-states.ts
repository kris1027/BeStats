import { V1_PAGE_SIZE } from "@bestats/core/api/v1/browse";
import {
  MAX_TITLE_KEYS,
  pickTitleState,
  type TitleType,
} from "@bestats/core/api/v1/titles";
import { idsKey } from "@bestats/core/tracking/ids-key";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef } from "react";

import { PRIVATE_QUERY_ROOT } from "./query-client";
import { useSession } from "./session";
import { fetchTitleState, fetchTitleStates, trackingKeys } from "./tracking";

/**
 * How many cards one state read covers: a loaded grid page, so scrolling to
 * the next page adds one read and never changes an earlier one's key
 * (prompts/mobile-look-card-actions.md, R6; AGENTS.md section 12, rate
 * limits). It stays within the API's `MAX_TITLE_KEYS`.
 */
export const CARD_STATE_CHUNK = Math.min(V1_PAGE_SIZE, MAX_TITLE_KEYS);

/** How long a page's batch read counts as fresh before the screen reads it again. */
const CARD_STATE_STALE_MS = 60_000;

/**
 * The batch read's key, under the private root so sign out, an expired
 * session and account deletion wipe it with every other private answer
 * (AGENTS.md section 11, private responses stay out of shared caches).
 */
export const cardStatesKey = (type: TitleType, ids: readonly number[]) =>
  [PRIVATE_QUERY_ROOT, "titles", "cards", type, idsKey(ids)] as const;

/**
 * The ids in fixed slices of `CARD_STATE_CHUNK` by screen position, each
 * slice without repeats. Slicing before removing repeats keeps every earlier
 * slice's key the same when a later page brings a title already shown, so
 * loading a page never reads an earlier one again
 * (prompts/mobile-look-card-actions.md, R6; AGENTS.md section 12, rate
 * limits). A title on two pages is read twice, which costs nothing extra.
 */
export function cardStateChunks(ids: readonly number[]): number[][] {
  const chunks: number[][] = [];
  for (let start = 0; start < ids.length; start += CARD_STATE_CHUNK) {
    chunks.push([...new Set(ids.slice(start, start + CARD_STATE_CHUNK))]);
  }
  return chunks;
}

/**
 * The same ids array for as long as the ids stay the same. Every caller maps
 * its items to a new array on each render, so without this the chunks and
 * `useQueries`' input were rebuilt every render
 * (prompts/mobile-look-review-fixes.md, decision 4).
 */
export function useStableIds(ids: readonly number[]): readonly number[] {
  const kept = useRef(ids);
  if (idsKey(kept.current) !== idsKey(ids)) kept.current = ids;
  return kept.current;
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
 * error, as on the web, and the catalog never waits on the session
 * (AGENTS.md section 7, the catalog is public). Only a title the answer
 * carried counts as known, so a card never falls back to reading its title
 * alone (R6). A seed never overwrites a state with a write in flight, nor
 * one written after the read started, so an older batch answer cannot undo
 * an optimistic tap or a confirmed write
 * (prompts/mobile-look-review-fixes.md, decisions 3 and 8).
 */
export function useCardStates(
  type: TitleType,
  ids: readonly number[],
): (id: number) => boolean {
  const { session } = useSession();
  const queries = useQueryClient();
  const stableIds = useStableIds(ids);
  const chunks = useMemo(() => cardStateChunks(stableIds), [stableIds]);

  const results = useQueries({
    queries: chunks.map((chunk) => ({
      queryKey: cardStatesKey(type, chunk),
      enabled: session !== null,
      staleTime: CARD_STATE_STALE_MS,
      queryFn: async () => {
        const startedAt = Date.now();
        const titles = await fetchTitleStates(type, chunk);
        const carried: number[] = [];
        for (const id of chunk) {
          const state = pickTitleState(titles, type, id);
          if (state === null) continue;
          carried.push(id);
          const key = trackingKeys.title(type, id);
          if (queries.isMutating({ mutationKey: key }) > 0) continue;
          const updatedAt = queries.getQueryState(key)?.dataUpdatedAt ?? 0;
          if (updatedAt >= startedAt) continue;
          queries.setQueryData(key, state);
        }
        return carried;
      },
    })),
  });

  const known = new Set<number>();
  for (const result of results) {
    if (result.isSuccess) for (const id of result.data) known.add(id);
  }
  return (id) => session !== null && known.has(id);
}

/**
 * One card's state, read from the title's own key that `useCardStates`
 * seeded; a card asks for it only once its batch has answered. The seed
 * never goes stale for a card (`staleTime: Infinity`), so a card scrolling
 * back into view, a refocus or a reconnect never reads one title by itself:
 * the batch read keeps the seeds fresh, one request per page
 * (prompts/mobile-look-card-actions.md, R6). A write still invalidates the
 * key, and invalidation refetches a mounted card whatever its `staleTime`,
 * so the card then shows the confirmed state (AGENTS.md section 11, no false
 * success). Undefined while signed out or unreadable.
 */
export function useCardState<T extends TitleType>(type: T, id: number) {
  return useQuery({
    queryKey: trackingKeys.title(type, id),
    queryFn: () => fetchTitleState(type, id),
    staleTime: Number.POSITIVE_INFINITY,
  }).data;
}
