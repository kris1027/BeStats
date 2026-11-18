import { QueryClient } from "@tanstack/react-query";

import { clearPrivateQueries } from "./query-client";

/**
 * covers: spec 0033, AC-13 (sign out leaves no private data in the cache),
 * and prompts/mobile-sign-out-spinner.md (public catalog queries stay, so an
 * open screen keeps what it shows)
 */
test("wipes every me query and mutation, and keeps the catalog", () => {
  // No garbage collection timer, so the test leaves nothing running.
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } },
  });
  client.setQueryData(["me", "titles", "movie:603"], { planned: false });
  client.setQueryData(["catalog", "movie", 603], { id: 603 });
  client.getMutationCache().build(client, { mutationFn: async () => null });

  clearPrivateQueries(client);

  expect(client.getQueryData(["me", "titles", "movie:603"])).toBeUndefined();
  expect(client.getQueryData(["catalog", "movie", 603])).toEqual({ id: 603 });
  expect(client.getMutationCache().getAll()).toHaveLength(0);
});
