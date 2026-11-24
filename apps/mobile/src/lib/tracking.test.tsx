import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Text } from "@/components/text";
import { ToastProvider } from "@/components/toast";

import { ApiError } from "./api";
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

jest.mock("./haptics", () => ({
  confirmedWriteHaptic: jest.fn(),
  refusedWriteHaptic: jest.fn(),
}));

/**
 * covers: prompts/mobile-web-parity-foundation.md, decision 10, requirement
 * 10 and AC-6 (a medium tap once the server confirms, the error buzz on a
 * refusal, nothing before the answer and nothing after a sign out)
 */
describe("haptics", () => {
  const haptics = jest.requireMock("./haptics") as {
    confirmedWriteHaptic: jest.Mock;
    refusedWriteHaptic: jest.Mock;
  };
  const METRICS = {
    frame: { x: 0, y: 0, width: 375, height: 812 },
    insets: { top: 0, left: 0, right: 0, bottom: 0 },
  };
  let send: ReturnType<typeof useTrackingWrite<string, void, void>> | null =
    null;

  function Writer({ run }: { run: () => Promise<void> }) {
    send = useTrackingWrite<string, void, void>({
      stateKey: ["me", "haptics"],
      control: "watched",
      apply: (state) => state,
      write: run,
      failure: "failed",
    });
    return null;
  }

  async function mount(run: () => Promise<void>) {
    const queries = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { gcTime: Infinity },
      },
    });
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={queries}>
          <ToastProvider>
            <Writer run={run} />
          </ToastProvider>
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    return queries;
  }

  beforeEach(() => {
    haptics.confirmedWriteHaptic.mockClear();
    haptics.refusedWriteHaptic.mockClear();
  });

  test("taps once the server confirms, never before", async () => {
    let answer: () => void = () => {};
    const queries = await mount(
      () =>
        new Promise<void>((resolve) => {
          answer = resolve;
        }),
    );
    await act(async () => {
      send?.mutate();
    });
    expect(haptics.confirmedWriteHaptic).not.toHaveBeenCalled();
    await act(async () => answer());
    await waitFor(() =>
      expect(haptics.confirmedWriteHaptic).toHaveBeenCalledTimes(1),
    );
    expect(haptics.refusedWriteHaptic).not.toHaveBeenCalled();
    queries.clear();
  });

  test("buzzes the error on a refusal", async () => {
    const queries = await mount(async () => {
      throw new ApiError(409, "conflict", "No longer applies");
    });
    await act(async () => {
      await send?.mutateAsync().catch(() => {});
    });
    expect(haptics.refusedWriteHaptic).toHaveBeenCalledTimes(1);
    expect(haptics.confirmedWriteHaptic).not.toHaveBeenCalled();
    queries.clear();
  });

  test("stays still when a sign out cut the write short", async () => {
    const queries = await mount(async () => {
      throw new ApiError(401, "unauthenticated", "Signed out");
    });
    await act(async () => {
      await send?.mutateAsync().catch(() => {});
    });
    expect(haptics.refusedWriteHaptic).not.toHaveBeenCalled();
    expect(haptics.confirmedWriteHaptic).not.toHaveBeenCalled();
    queries.clear();
  });
});
