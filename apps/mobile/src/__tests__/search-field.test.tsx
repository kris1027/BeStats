import {
  FILTER_DEBOUNCE_MS,
  MAX_QUERY_LENGTH,
} from "@bestats/core/search/constants";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import type { PropsWithChildren } from "react";

import { ToastProvider } from "@/components/toast";
import { MediaTypeProvider } from "@/lib/media-type";
import { SearchScreen } from "@/screens/search-screen";

/**
 * covers: prompts/mobile-look-search.md, AC-2, and
 * prompts/mobile-media-switch-glass.md, Search follow up (the title field
 * pinned under the switch runs the title search after the pause, cuts text
 * past `MAX_QUERY_LENGTH`, and Clear search shows browse results again).
 */
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

const FIELD = "Search shows by title";

async function renderSearch() {
  await renderRouter(
    { search: SearchScreen },
    { initialUrl: "/search", wrapper },
  );
  await screen.findByText("Popular shows on TMDB");
}

/** Types into the field, then lets the screen's pause run out. */
async function typed(text: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(FIELD), text);
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

test("typing in the field runs the title search after the pause", async () => {
  await renderSearch();
  await typed("zelda");
  await waitFor(() =>
    expect(mockFetchSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "tv", q: "zelda" }),
      1,
    ),
  );
});

test("text past MAX_QUERY_LENGTH is cut in the field and the query", async () => {
  await renderSearch();
  await typed("a".repeat(MAX_QUERY_LENGTH + 5));
  const capped = "a".repeat(MAX_QUERY_LENGTH);
  expect(screen.getByLabelText(FIELD)).toHaveDisplayValue(capped);
  await waitFor(() =>
    expect(mockFetchSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: capped }),
      1,
    ),
  );
});

test("Clear search shows browse results again", async () => {
  await renderSearch();
  await typed("zelda");
  await waitFor(() =>
    expect(mockFetchSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "zelda" }),
      1,
    ),
  );
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Clear search" }));
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
