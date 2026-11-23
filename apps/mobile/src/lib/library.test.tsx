/**
 * covers: spec 0033, AC-10 (the app sends the web route and type, the server
 * places the title) and AC-13 (library keys sit under the private root), and
 * AGENTS.md section 11 (a signed out tab sends no private request).
 */
const mockApiRequest = jest.fn();
jest.mock("./api", () => ({
  ...jest.requireActual("./api"),
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

import { libraryPath } from "@bestats/core/catalog/library-list";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import { testQueryClient } from "@/test-utils/title-harness";

import { fetchLibraryPage, libraryKeys, useLibraryPage } from "./library";
import { PRIVATE_QUERY_ROOT } from "./query-client";

const MOVIE_WATCHLIST = libraryPath("watchlist", "movie");
const UP_NEXT = libraryPath("watchlist", "tv");
const PLAYING = libraryPath("upcoming", "game");

function page(number: number, nextPage: number | null) {
  return {
    type: "movie",
    path: MOVIE_WATCHLIST,
    page: number,
    pageSize: 24,
    entries: [],
    total: 0,
    failedCount: 0,
    capped: false,
    nextPage,
  };
}

function wrapper() {
  const client = testQueryClient();
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => mockApiRequest.mockReset());

describe("libraryKeys", () => {
  test("every key starts with the private root, so sign out wipes it", () => {
    expect(libraryKeys.all[0]).toBe(PRIVATE_QUERY_ROOT);
    expect(libraryKeys.page("tv", UP_NEXT)[0]).toBe(PRIVATE_QUERY_ROOT);
  });

  test("a page key sits under `all`, so one invalidation reaches every page", () => {
    const key = libraryKeys.page("game", PLAYING);
    expect(key.slice(0, libraryKeys.all.length)).toEqual([...libraryKeys.all]);
  });
});

test("a page read sends the route, the type and the page, with the session", () => {
  mockApiRequest.mockResolvedValue(page(2, null));
  fetchLibraryPage("tv", UP_NEXT, 2);
  const [path, , options] = mockApiRequest.mock.calls[0];
  const url = new URL(path, "http://app.test");
  expect(url.pathname).toBe("/api/v1/me/library");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    type: "tv",
    path: UP_NEXT,
    page: "2",
  });
  expect(options).toEqual({ auth: true });
});

test("signed out, the hook sends no request", async () => {
  const { result } = await renderHook(
    () => useLibraryPage("movie", MOVIE_WATCHLIST, false),
    { wrapper: wrapper() },
  );
  expect(result.current.fetchStatus).toBe("idle");
  expect(mockApiRequest).not.toHaveBeenCalled();
});

test("it loads page 1, then the next page the server names, then stops", async () => {
  mockApiRequest
    .mockResolvedValueOnce(page(1, 2))
    .mockResolvedValueOnce(page(2, null));
  const { result } = await renderHook(
    () => useLibraryPage("movie", MOVIE_WATCHLIST, true),
    { wrapper: wrapper() },
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockApiRequest.mock.calls[0][0]).toContain("page=1");
  expect(result.current.hasNextPage).toBe(true);

  await act(async () => {
    await result.current.fetchNextPage();
  });
  await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
  expect(mockApiRequest.mock.calls[1][0]).toContain("page=2");
  expect(result.current.hasNextPage).toBe(false);
});

test("a failed read is an error, never an empty page", async () => {
  mockApiRequest.mockRejectedValue(new Error("502"));
  const { result } = await renderHook(
    () => useLibraryPage("movie", MOVIE_WATCHLIST, true),
    { wrapper: wrapper() },
  );
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toBeUndefined();
});
