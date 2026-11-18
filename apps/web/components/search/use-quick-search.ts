"use client";

import { useEffect, useState } from "react";

import { QUICK_DEBOUNCE_MS, QUICK_MIN_CHARS } from "@/lib/search/constants";
import type { SearchType } from "@/lib/search/params";
import type { QuickSearchResponse } from "@/lib/search/quick";

/**
 * What the quick search panel can be showing (spec 0010, AC-2, AC-5).
 *
 * `loading` keeps the rows of the last answer, if there was one, so a follow
 * up keystroke dims them instead of collapsing the panel to skeletons.
 */
export type QuickSearchState =
  | { status: "idle" }
  | { status: "loading"; previous: QuickSearchResponse | null }
  | { status: "ok"; query: string; data: QuickSearchResponse }
  | { status: "error"; query: string };

/**
 * Asks `GET /api/search` about the field's query once typing pauses
 * (spec 0010, AC-2, AC-5).
 *
 * Every change to the trimmed query cancels the pending timer and aborts the
 * request in flight, and a response is dropped if its request was aborted, so
 * an answer for `du` can never land after the one for `dune`. Below two
 * characters nothing is sent and the state is idle.
 *
 * @param type The catalog the navbar is on.
 * @param query The raw field value.
 * @returns The state, and `retry`, which repeats the same query past the
 * browser's HTTP cache.
 */
export function useQuickSearch(type: SearchType, query: string) {
  const trimmed = query.trim();
  const active = trimmed.length >= QUICK_MIN_CHARS;
  const [state, setState] = useState<QuickSearchState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active) {
      setState({ status: "idle" });
      return;
    }

    setState((current) => ({
      status: "loading",
      previous:
        current.status === "ok"
          ? current.data
          : current.status === "loading"
            ? current.previous
            : null,
    }));

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?${new URLSearchParams({ type, q: trimmed })}`,
          {
            signal: controller.signal,
            // A retry must reach the server, not a cached failure.
            cache: attempt > 0 ? "no-store" : "default",
          },
        );
        if (!response.ok) throw new Error(`quick search ${response.status}`);
        const data = (await response.json()) as QuickSearchResponse;
        if (controller.signal.aborted) return;
        setState({ status: "ok", query: trimmed, data });
      } catch {
        if (controller.signal.aborted) return;
        setState({ status: "error", query: trimmed });
      }
    }, QUICK_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [type, trimmed, active, attempt]);

  return { state, retry: () => setAttempt((count) => count + 1) };
}
