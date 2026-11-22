import type { ClearedState } from "@bestats/core/api/v1/cleared";
import { V1_ERROR_MESSAGES } from "@bestats/core/api/v1/errors";
import { v1SeasonStateSchema } from "@bestats/core/api/v1/show";
import {
  pickTitleState,
  type TitleType,
  titleKey,
  v1TitlesSchema,
} from "@bestats/core/api/v1/titles";
import {
  RETRY_ACTION_LABEL,
  UNDO_ACTION_LABEL,
} from "@bestats/core/tracking/messages";
import {
  partialMatchKey,
  type QueryKey,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { z } from "zod";

import { useToast } from "@/components/toast";

import { ApiError, apiRequest } from "./api";
import { libraryKeys } from "./library";
import { PRIVATE_QUERY_ROOT } from "./query-client";

/**
 * Query keys of the caller's own state. Every one starts with
 * `PRIVATE_QUERY_ROOT`, so `clearPrivateQueries()` wipes them all on sign out
 * (spec 0033, AC-13; AGENTS.md section 11).
 */
export const trackingKeys = {
  title: (type: TitleType, id: number) =>
    [PRIVATE_QUERY_ROOT, "titles", titleKey(type, id)] as const,
  season: (showId: number, seasonNumber: number) =>
    [PRIVATE_QUERY_ROOT, "season", showId, seasonNumber] as const,
};

/**
 * One title's stored state, from `/api/v1/me/titles` (spec 0035, API
 * surface). The API answers every asked key, so a missing or misshapen one is
 * an unreadable answer, never an empty state guessed by the app (AGENTS.md
 * section 11).
 */
export async function fetchTitleState<T extends TitleType>(
  type: T,
  id: number,
) {
  const titles = await apiRequest(
    `/api/v1/me/titles?ids=${titleKey(type, id)}`,
    v1TitlesSchema,
    { auth: true },
  );
  const state = pickTitleState(titles, type, id);
  if (!state) throw new ApiError(200, "internal", V1_ERROR_MESSAGES.internal);
  return state;
}

/**
 * `GET /api/v1/me/shows/{id}/seasons/{n}`: the caller's episode rows for one
 * season, keyed by episode id the way core's episode intents read them, so
 * the optimistic rows come from `applyEpisodeIntent` and never a copy
 * (apps/mobile/AGENTS.md, BeStats rules). Mark and rating stay separate
 * fields, as they are independent (AGENTS.md section 7).
 */
export async function fetchSeasonState(showId: number, seasonNumber: number) {
  const body = await apiRequest(
    `/api/v1/me/shows/${showId}/seasons/${seasonNumber}`,
    v1SeasonStateSchema,
    { auth: true },
  );
  const states: Record<number, { watched: boolean; rating: number | null }> =
    {};
  const watchedAt: Record<number, string> = {};
  for (const row of body.episodes) {
    states[row.episodeId] = {
      watched: row.watchedAt !== null,
      rating: row.rating,
    };
    if (row.watchedAt) watchedAt[row.episodeId] = row.watchedAt;
  }
  return { states, watchedAt };
}

export type SeasonState = Awaited<ReturnType<typeof fetchSeasonState>>;

/**
 * Posts an Undo to its restore route (spec 0035, Undo): the body is always
 * `{ cleared }`, built from the earlier write's own answer, and the route
 * refuses a kind that is not its own. Every restore goes through here, so
 * the app never builds an Undo body that names another user's rows; RLS
 * bounds them on the server anyway (AGENTS.md section 11).
 */
export function postRestore<T>(
  path: string,
  cleared: ClearedState,
  schema: z.ZodType<T>,
) {
  return apiRequest(path, schema, {
    method: "POST",
    body: { cleared },
    auth: true,
  });
}

/**
 * The English copy for a failed write: the server's own message (core's
 * tracking copy), or `fallback` for anything that never reached it as a v1
 * error. The UI never invents a reason (AGENTS.md section 11).
 */
export function writeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

type WriteOptions<TState, TVars, TResult> = {
  /** The cached state this write moves at once. */
  stateKey: QueryKey;
  /**
   * The control a failure toast speaks for, so it replaces only that
   * control's earlier toast (prompts/mobile-title-tracking.md, decision 3).
   */
  control: string | ((vars: TVars) => string);
  /** The optimistic state: always one of core's intent rules, never a copy. */
  apply: (state: TState, vars: TVars) => TState;
  write: (vars: TVars) => Promise<TResult>;
  /** Other private queries the write changes (progress, ratings). */
  alsoInvalidate?: QueryKey[];
  /**
   * The fallback copy when the error carries no server message, or a function
   * that picks it from the error, for a write whose own client step can fail
   * apart from the server (Mark next's season read).
   */
  failure: string | ((error: unknown) => string);
  /**
   * For an Undo: the web's "Couldn't undo" line, shown when the server says
   * the Undo no longer applies (`undo_expired`, or `conflict` when the state
   * changed since).
   */
  expired?: string;
  onSuccess?: (result: TResult, vars: TVars) => void;
  /** Runs after a refused write is rolled back (closes a picker, say). */
  onFailure?: () => void;
};

/**
 * Every tracking control's write (prompts/mobile-title-tracking.md, decision
 * 2): the state moves at once by core's intent rule, a refusal puts it back
 * and shows the server's reason in a toast, and the confirmed state is
 * always refetched from the server afterwards, so the screen never keeps a
 * false success (AGENTS.md section 11; child 0036, Optimistic writes).
 *
 * After a 401 the session is already gone and the private cache wiped, so
 * the old state is not put back: that would bring private data back after
 * sign out (spec 0033, AC-13). The refetch waits for the last write on the
 * same state, so two quick taps never flash the first answer.
 *
 * A write that never reached the server (the `network` error, offline say)
 * fails like any other and its toast offers Retry, which sends the same
 * write again; nothing is queued for later (AC-13). A refusal the server
 * meant gets no Retry: sending it again would only be refused again.
 */
export function useTrackingWrite<TState, TVars, TResult>({
  stateKey,
  control,
  apply,
  write,
  alsoInvalidate = [],
  failure,
  expired,
  onSuccess,
  onFailure,
}: WriteOptions<TState, TVars, TResult>) {
  const queries = useQueryClient();
  const toast = useToast();
  const retry = useRef<(vars: TVars) => void>(() => {});
  const mutation = useMutation({
    mutationKey: stateKey,
    mutationFn: write,
    onMutate: async (vars: TVars) => {
      await queries.cancelQueries({ queryKey: stateKey });
      const previous = queries.getQueryData<TState>(stateKey);
      if (previous !== undefined) {
        queries.setQueryData(stateKey, apply(previous, vars));
      }
      return { previous };
    },
    onError: (error, vars, context) => {
      const signedOut =
        error instanceof ApiError && error.code === "unauthenticated";
      if (context?.previous !== undefined && !signedOut) {
        queries.setQueryData(stateKey, context.previous);
      }
      const stale =
        expired !== undefined &&
        error instanceof ApiError &&
        error.code === "conflict";
      const offline = error instanceof ApiError && error.code === "network";
      const key = toast.show({
        id: typeof control === "function" ? control(vars) : control,
        message: stale
          ? expired
          : writeErrorMessage(
              error,
              typeof failure === "function" ? failure(error) : failure,
            ),
        tone: "error",
        action: offline
          ? {
              label: RETRY_ACTION_LABEL,
              onPress: () => {
                toast.dismiss(key);
                retry.current(vars);
              },
            }
          : undefined,
      });
      onFailure?.();
    },
    onSuccess: (result, vars) => onSuccess?.(result, vars),
    onSettled: async () => {
      if (queries.isMutating({ mutationKey: stateKey }) > 1) return;
      // Every write can move a title between library pages, so the pages
      // reload when the Library tab is opened again (AGENTS.md section 9).
      // A key `libraryKeys.all` already covers (a library card's own page)
      // is left to it: invalidating it twice fetches the page twice.
      const keys = [stateKey, ...alsoInvalidate].filter(
        (queryKey) => !partialMatchKey(queryKey, libraryKeys.all),
      );
      await Promise.all(
        [...keys, libraryKeys.all].map((queryKey) =>
          queries.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
  const { mutate } = mutation;
  useEffect(() => {
    retry.current = mutate;
  }, [mutate]);
  return mutation;
}

/**
 * Offers Undo for a write that removed something (spec 0035, Undo): the toast
 * carries the core Undo label and speaks for `control`, and pressing it turns
 * the action off, runs the restore, and closes the toast once the restore
 * settles. A refused restore shows the error toast `useTrackingWrite` raises
 * under the restore's own control, so the outcome is always visible
 * (AGENTS.md section 11).
 */
export function useUndoToast() {
  const toast = useToast();
  return (
    message: string,
    control: string,
    restore: (done: () => void) => void,
  ) => {
    const key = toast.show({
      id: control,
      message,
      action: {
        label: UNDO_ACTION_LABEL,
        onPress: () => {
          toast.busy(key);
          restore(() => toast.dismiss(key));
        },
      },
    });
  };
}
