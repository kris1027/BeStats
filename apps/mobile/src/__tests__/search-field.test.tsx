import {
  FILTER_DEBOUNCE_MS,
  MAX_QUERY_LENGTH,
} from "@bestats/core/search/constants";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import type { PropsWithChildren } from "react";

import { ToastProvider } from "@/components/toast";
import { MediaTypeProvider } from "@/lib/media-type";
import { SearchScreen } from "@/screens/search-screen";

/**
 * covers: prompts/mobile-look-search.md, decision 1 and AC-2 (the header
 * search bar runs the title search after the pause, cuts text past
 * `MAX_QUERY_LENGTH`, and Cancel shows browse results again). The native bar
 * does not exist in Jest, so the test drives the options the screen hands
 * to `navigation.setOptions`.
 */
type SearchBarOptions = {
  ref: { current: unknown };
  onChangeText: (event: { nativeEvent: { text: string } }) => void;
  onCancelButtonPress: () => void;
};

let mockBarOptions: SearchBarOptions | null = null;
jest.mock("expo-router", () => {
  const actual = jest.requireActual("expo-router");
  const navigation = {
    setOptions: (options: { headerSearchBarOptions?: SearchBarOptions }) => {
      if (options.headerSearchBarOptions) {
        mockBarOptions = options.headerSearchBarOptions;
      }
    },
  };
  return { ...actual, useNavigation: () => navigation };
});

jest.mock("@/lib/session", () => ({
  useSession: () => ({ session: null }),
}));

const mockFetchSearch = jest.fn();
jest.mock("@/lib/catalog", () => ({
  ...jest.requireActual("@/lib/catalog"),
  fetchSearch: (...args: unknown[]) => mockFetchSearch(...args),
  fetchGenres: () => Promise.resolve({ type: "tv", genres: [] }),
}));

let client: QueryClient;
function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MediaTypeProvider>{children}</MediaTypeProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

const setText = jest.fn();

async function renderSearch() {
  await renderRouter(
    { search: SearchScreen },
    { initialUrl: "/search", wrapper },
  );
  await screen.findByText("Popular shows on TMDB");
  const bar = mockBarOptions;
  if (!bar) throw new Error("Search set no header search bar");
  bar.ref.current = { setText, clearText: jest.fn() };
  return bar;
}

/** Types into the bar, then lets the screen's pause run out. */
async function typed(bar: SearchBarOptions, text: string) {
  await act(async () => {
    bar.onChangeText({ nativeEvent: { text } });
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(FILTER_DEBOUNCE_MS);
  });
}

afterEach(() => jest.useRealTimers());

beforeEach(() => {
  jest.useFakeTimers();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.clearAllMocks();
  mockBarOptions = null;
  mockFetchSearch.mockImplementation((params: { type: string; q: string }) =>
    Promise.resolve({
      type: params.type,
      mode: params.q ? "search" : "browse",
      page: 1,
      pageSize: 24,
      results: [
        {
          id: 7,
          title: "Found title",
          year: 2024,
          releaseDate: "2024-01-01",
          posterUrl: null,
          communityRating: 7.5,
        },
      ],
      total: 1,
      totalIsExact: true,
      nextPage: null,
      scanned: null,
    }),
  );
});

test("typing in the header bar runs the title search after the pause", async () => {
  const bar = await renderSearch();
  await typed(bar, "zelda");
  await waitFor(() =>
    expect(mockFetchSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "tv", q: "zelda" }),
      1,
    ),
  );
});

test("text past MAX_QUERY_LENGTH is cut in the bar and the query", async () => {
  const bar = await renderSearch();
  await typed(bar, "a".repeat(MAX_QUERY_LENGTH + 5));
  const capped = "a".repeat(MAX_QUERY_LENGTH);
  expect(setText).toHaveBeenCalledWith(capped);
  await waitFor(() =>
    expect(mockFetchSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: capped }),
      1,
    ),
  );
});

test("Cancel shows browse results again", async () => {
  const bar = await renderSearch();
  await typed(bar, "zelda");
  await waitFor(() =>
    expect(mockFetchSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "zelda" }),
      1,
    ),
  );
  await act(async () => {
    bar.onCancelButtonPress();
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(FILTER_DEBOUNCE_MS);
  });
  await waitFor(() =>
    expect(mockFetchSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: null }),
      1,
    ),
  );
  expect(await screen.findByText("Popular shows on TMDB")).toBeOnTheScreen();
});
