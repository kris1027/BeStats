import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import { ToastProvider } from "@/components/toast";

import { libraryKeys } from "./library";
import { useTrackingWrite } from "./tracking";

/**
 * covers: a library card's write refetches its own page once. The page's key
 * sits under `libraryKeys.all`, so invalidating both used to refetch it
 * twice (the second cancelling the first).
 */
const pageKey = libraryKeys.page("movie", "/watchlist");

let write: ReturnType<typeof useTrackingWrite<string, void, void>> | null =
  null;

function Probe({ fetchPage }: { fetchPage: () => Promise<string> }) {
  const page = useQuery({ queryKey: pageKey, queryFn: fetchPage });
  write = useTrackingWrite<string, void, void>({
    stateKey: pageKey,
    control: "card",
    apply: (state) => state,
    write: async () => {},
    failure: "failed",
  });
  return <Text>{page.data ?? "loading"}</Text>;
}

test("a write on a library page refetches that page once", async () => {
  // No garbage collection timer outlives the test once it unmounts.
  const queries = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  const fetchPage = jest.fn(async () => "page");
  await render(
    <QueryClientProvider client={queries}>
      <ToastProvider>
        <Probe fetchPage={fetchPage} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(1));

  await act(async () => {
    await write?.mutateAsync();
  });
  await waitFor(() => expect(queries.isFetching()).toBe(0));

  expect(fetchPage).toHaveBeenCalledTimes(2);
  queries.clear();
});
