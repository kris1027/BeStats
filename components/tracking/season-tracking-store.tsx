"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  startTransition,
  useContext,
  useOptimistic,
} from "react";

import {
  applyEpisodeIntents,
  type EpisodeIntent,
  type EpisodeStates,
} from "@/lib/tracking/episode-intent";
import type { EpisodeTrackingError } from "@/lib/tracking/types";

import { showEpisodeTrackingError } from "./tracking-toast";

/** Any action result: a success with whatever it carries, or a refusal. */
type ActionResult = { ok: true } | { ok: false; error: EpisodeTrackingError };

/** What a rejected call (offline, a server error, a deploy) settles as. */
type WriteFailed = { ok: false; error: "write_failed" };

type SeasonTrackingContext = {
  showId: number;
  seasonNumber: number;
  /** Where the session expired toast's Sign in action comes back to. */
  returnPath: string;
  /** Every click still in flight on this page, oldest first. */
  pending: readonly EpisodeIntent[];
  /**
   * Runs one action with its optimistic intents. The intents show at once and
   * last exactly as long as the call's transition, so a success gives way to
   * the rows `refresh()` delivers and a failure to the unchanged ones, which
   * is the rollback (AC-13). A rejected call settles as `write_failed`.
   */
  run: <R extends ActionResult>(
    intents: readonly EpisodeIntent[],
    call: () => Promise<R>,
    onSettled: (result: R | WriteFailed) => void,
  ) => void;
  /** Shows a failure toast under the given id. */
  fail: (error: EpisodeTrackingError, toastId: string) => void;
};

const Context = createContext<SeasonTrackingContext | null>(null);

/**
 * The season page's shared optimistic state (spec 0011, API surface).
 *
 * The header's count and every row read the same pending list, so marking a
 * season flips every row and the count in one frame, and an episode click
 * moves the count too (AC-13). It holds no user data of its own: the
 * confirmed states arrive as props on each slot, from the one request scoped
 * read, so wrapping the page in it adds no session read to the shell.
 *
 * Calls queue in the Next.js action queue rather than being dropped, and each
 * carries a target value, so rapid clicks settle on the last one (AC-16).
 */
function SeasonTrackingStore({
  showId,
  seasonNumber,
  returnPath,
  children,
}: {
  showId: number;
  seasonNumber: number;
  returnPath: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, addPending] = useOptimistic<
    readonly EpisodeIntent[],
    readonly EpisodeIntent[]
  >([], (list, added) => [...list, ...added]);

  const value: SeasonTrackingContext = {
    showId,
    seasonNumber,
    returnPath,
    pending,
    run(intents, call, onSettled) {
      startTransition(async () => {
        addPending(intents);
        const result = await call().then(
          (settled): typeof settled | WriteFailed => settled,
          (): WriteFailed => ({ ok: false, error: "write_failed" }),
        );
        onSettled(result);
      });
    },
    fail(error, toastId) {
      showEpisodeTrackingError(error, {
        id: toastId,
        returnPath,
        navigate: router.push,
      });
    },
  };

  return <Context value={value}>{children}</Context>;
}

/** The store, for a control rendered inside `SeasonTrackingStore`. */
function useSeasonTracking(): SeasonTrackingContext {
  const context = useContext(Context);
  if (!context) {
    throw new Error("Season tracking controls need a SeasonTrackingStore.");
  }
  return context;
}

/**
 * The states a control shows: the server's, with every pending click on this
 * page replayed on top.
 *
 * @param confirmed The states the slot received from the server.
 */
function useEpisodeStates(confirmed: EpisodeStates): EpisodeStates {
  const { pending } = useSeasonTracking();
  return applyEpisodeIntents(confirmed, pending);
}

export { SeasonTrackingStore, useEpisodeStates, useSeasonTracking };
