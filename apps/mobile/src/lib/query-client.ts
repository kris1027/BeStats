import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "./api";
import { PRIVATE_QUERY_ROOT } from "./movies";

/**
 * The app's one query cache. In the tracer it lives in memory only, so no
 * private data is written to disk; the persisted offline cache arrives with
 * spec 0033 Build plan step 5, wiped on every sign out (AC-13).
 *
 * A refusal the server meant (any 4xx) is not retried; a network failure or
 * a 5xx is retried once.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: (failureCount, error) =>
        failureCount < 1 &&
        !(
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500
        ),
    },
    mutations: { retry: false },
  },
});

/**
 * Wipes everything private from the cache on sign out: every `"me"` query
 * and every mutation, whose input can be private (spec 0033, AC-13; AGENTS.md
 * section 11). Public catalog queries stay on purpose. `clear()` would also
 * remove the movie an open screen is showing and cancel its reload, which
 * left that screen on a spinner for good (prompts/mobile-sign-out-spinner.md).
 */
export function clearPrivateQueries(client: QueryClient = queryClient): void {
  client.removeQueries({ queryKey: [PRIVATE_QUERY_ROOT] });
  client.getMutationCache().clear();
}
