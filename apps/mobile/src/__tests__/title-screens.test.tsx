import { V1_ERROR_MESSAGES } from "@bestats/core/api/v1/errors";
import { catalogList } from "@bestats/core/catalog/lists";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, userEvent } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import type { PropsWithChildren } from "react";

import GameRoute from "@/app/(tabs)/(index,search,library,account)/games/[id]";
import ShowRoute from "@/app/(tabs)/(index,search,library,account)/shows/[id]";
import { ApiError } from "@/lib/api";

/**
 * covers: prompts/mobile-app-shell-catalog.md decisions 7 and 8: a
 * `/shows/{x}` or `/games/{x}` path is a list when `x` is a list slug and a
 * title otherwise; an invalid id never calls the API; a missing title ends
 * there, any other failure offers Retry (AGENTS.md section 11).
 */
const mockFetchList = jest.fn();
const mockFetchShow = jest.fn();
const mockFetchGame = jest.fn();
jest.mock("@/lib/catalog", () => ({
  ...jest.requireActual("@/lib/catalog"),
  fetchList: (...args: unknown[]) => mockFetchList(...args),
  fetchShow: (...args: unknown[]) => mockFetchShow(...args),
  fetchGame: (...args: unknown[]) => mockFetchGame(...args),
}));

let client: QueryClient;
function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.resetAllMocks();
});

test("a list slug under /shows opens the list, not a show", async () => {
  mockFetchList.mockResolvedValue({
    type: "tv",
    list: "popular",
    page: 1,
    pageSize: 24,
    results: [],
    total: 0,
    totalIsExact: true,
    nextPage: null,
  });
  await renderRouter(
    { "shows/[id]": ShowRoute },
    { initialUrl: "/shows/popular", wrapper },
  );
  expect(
    await screen.findByText(catalogList("tv", "popular").note),
  ).toBeOnTheScreen();
  expect(mockFetchShow).not.toHaveBeenCalled();
});

test("an invalid show id reads as not found without calling the API", async () => {
  await renderRouter(
    { "shows/[id]": ShowRoute },
    { initialUrl: "/shows/abc", wrapper },
  );
  expect(
    await screen.findByText(V1_ERROR_MESSAGES.not_found),
  ).toBeOnTheScreen();
  expect(mockFetchShow).not.toHaveBeenCalled();
});

test("a missing show ends at not found, with no Retry", async () => {
  mockFetchShow.mockRejectedValue(
    new ApiError(404, "not_found", "We couldn't find that title."),
  );
  await renderRouter(
    { "shows/[id]": ShowRoute },
    { initialUrl: "/shows/1399", wrapper },
  );
  expect(
    await screen.findByText("We couldn't find that title."),
  ).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
});

test("a failed game read offers Retry, which reads it again", async () => {
  mockFetchGame.mockRejectedValue(
    new ApiError(502, "catalog_unavailable", "IGDB didn't respond."),
  );
  await renderRouter(
    { "games/[id]": GameRoute },
    { initialUrl: "/games/1942", wrapper },
  );
  expect(await screen.findByText("IGDB didn't respond.")).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Retry" }));
  expect(mockFetchGame).toHaveBeenCalledTimes(2);
});
