import type { V1CatalogItem } from "@bestats/core/api/v1/browse";
import type { LibraryType } from "@bestats/core/catalog/media-type";
import {
  MOVIE_CLEARED_MESSAGES,
  SHOW_TRACKING_COPY,
  TRACKING_MESSAGES,
} from "@bestats/core/tracking/messages";
import {
  act,
  fireEvent,
  screen,
  userEvent,
  waitFor,
} from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import { Alert, Platform } from "react-native";

import { PosterGrid } from "@/components/poster-grid";
import { ApiError } from "@/lib/api";
import {
  createApiMock,
  testQueryClient,
  titleWrapper,
} from "@/test-utils/title-harness";

/**
 * covers: prompts/mobile-look-card-actions.md, R1 (the card shows the user's
 * own marks), R2 and R3 (the menu's actions reach screen readers and, on
 * Android, a long press alert), R4 (a removal offers Undo), R5 (a refused
 * write goes back with the server's message), R6 (one state read per page
 * of cards) and R7 (signed out, the plain card with no actions)
 */
const mockApi = createApiMock();
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  apiRequest: (...args: [string, unknown, Record<string, unknown>]) =>
    mockApi.handle(...args),
}));

let mockSession: object | null = { user: { email: "a@example.test" } };
jest.mock("@/lib/session", () => ({
  useSession: () => ({ session: mockSession }),
}));

const WATCHED_AT = "2026-11-01T10:00:00.000Z";

function item(id: number, title: string): V1CatalogItem {
  return {
    id,
    title,
    year: 1999,
    releaseDate: "1999-03-31",
    posterUrl: null,
    communityRating: 8.2,
  };
}

const MOVIES = [item(603, "The Matrix"), item(604, "The Matrix Reloaded")];
const MOVIES_PATH = "/api/v1/me/titles?ids=movie:603,movie:604";

async function openGrid(type: LibraryType, items: V1CatalogItem[]) {
  const client = testQueryClient();
  function Grid() {
    return <PosterGrid items={items} type={type} accessibilityLabel="Grid" />;
  }
  await renderRouter(
    { index: Grid, "movies/[id]": () => null, "shows/[id]": () => null },
    { initialUrl: "/", wrapper: titleWrapper(client) },
  );
  return client;
}

const card = (name: RegExp) => screen.findByRole("link", { name });

/** The card once its state has been read and its actions wired. */
function readyCard(name: RegExp) {
  return waitFor(() => {
    const found = screen.getByRole("link", { name });
    expect(found.props.accessibilityActions.length).toBeGreaterThan(0);
    return found;
  });
}

function act11y(element: ReturnType<typeof screen.getByRole>, name: string) {
  fireEvent(element, "accessibilityAction", {
    nativeEvent: { actionName: name },
  });
}

beforeEach(() => {
  mockApi.reset();
  mockSession = { user: { email: "a@example.test" } };
});

test("reads every card's state in one request and shows the marks", async () => {
  mockApi.on("GET", MOVIES_PATH, () => ({
    "movie:603": { planned: true, watchedAt: null, rating: null },
    "movie:604": { planned: false, watchedAt: WATCHED_AT, rating: 8 },
  }));
  await openGrid("movie", MOVIES);

  expect(await card(/^The Matrix, 1999, TMDB 8\.2, Planned$/)).toBeTruthy();
  expect(
    await card(/^The Matrix Reloaded, 1999, TMDB 8\.2, Watched, Your score 8$/),
  ).toBeTruthy();
  expect(screen.getByText("8")).toBeOnTheScreen();
  expect(mockApi.callsTo("GET", MOVIES_PATH)).toHaveLength(1);
  expect(
    mockApi.calls.filter((call) => call.path.startsWith("/api/v1/me/titles")),
  ).toHaveLength(1);
});

test("offers the menu's actions to screen readers, and Plan writes at once", async () => {
  let planned = false;
  mockApi.on("GET", MOVIES_PATH, () => ({
    "movie:603": { planned, watchedAt: null, rating: null },
    "movie:604": { planned: false, watchedAt: null, rating: null },
  }));
  mockApi.on("GET", "/api/v1/me/titles?ids=movie:603", () => ({
    "movie:603": { planned, watchedAt: null, rating: null },
  }));
  mockApi.on("PUT", "/api/v1/me/movies/603/watchlist", () => {
    planned = true;
    return { ok: true };
  });
  await openGrid("movie", MOVIES);

  const matrix = await readyCard(/^The Matrix, 1999, TMDB 8\.2$/);
  expect(matrix.props.accessibilityActions).toEqual([
    { name: "plan", label: "Plan" },
    { name: "watched", label: "Mark watched" },
  ]);
  await act(async () => act11y(matrix, "plan"));

  expect(await card(/^The Matrix, 1999, TMDB 8\.2, Planned$/)).toBeTruthy();
  expect(
    mockApi.callsTo("PUT", "/api/v1/me/movies/603/watchlist")[0]?.body,
  ).toEqual({ planned: true });
});

test("removing a watch mark offers Undo, which brings mark and score back", async () => {
  let state = {
    planned: false,
    watchedAt: WATCHED_AT as string | null,
    rating: 8 as number | null,
  };
  mockApi.on("GET", MOVIES_PATH, () => ({
    "movie:603": state,
    "movie:604": { planned: false, watchedAt: null, rating: null },
  }));
  mockApi.on("GET", "/api/v1/me/titles?ids=movie:603", () => ({
    "movie:603": state,
  }));
  mockApi.on("PUT", "/api/v1/me/movies/603/watched", () => {
    state = { planned: false, watchedAt: null, rating: null };
    return { ok: true, cleared: { watchedAt: WATCHED_AT, rating: 8 } };
  });
  mockApi.on("POST", "/api/v1/me/movies/603/watched/restore", () => {
    state = { planned: false, watchedAt: WATCHED_AT, rating: 8 };
    return { ok: true };
  });
  const user = userEvent.setup();
  await openGrid("movie", MOVIES);

  const matrix = await card(/^The Matrix, .*Watched/);
  await act(async () => act11y(matrix, "watched"));
  expect(
    await screen.findByText(MOVIE_CLEARED_MESSAGES.unwatched),
  ).toBeOnTheScreen();
  expect(await card(/^The Matrix, 1999, TMDB 8\.2$/)).toBeTruthy();

  await user.press(screen.getByRole("button", { name: "Undo" }));
  expect(
    mockApi.callsTo("POST", "/api/v1/me/movies/603/watched/restore")[0]?.body,
  ).toEqual({
    cleared: {
      kind: "movie_watched",
      movieId: 603,
      watchedAt: WATCHED_AT,
      rating: 8,
    },
  });
  expect(await card(/^The Matrix, .*Watched, Your score 8$/)).toBeTruthy();
});

test("a refused write puts the card back and says why", async () => {
  mockApi.on("GET", MOVIES_PATH, () => ({
    "movie:603": { planned: false, watchedAt: null, rating: null },
    "movie:604": { planned: false, watchedAt: null, rating: null },
  }));
  mockApi.on("GET", "/api/v1/me/titles?ids=movie:603", () => ({
    "movie:603": { planned: false, watchedAt: null, rating: null },
  }));
  mockApi.on("PUT", "/api/v1/me/movies/603/watchlist", () => {
    throw new ApiError(500, "internal", TRACKING_MESSAGES.write_failed);
  });
  await openGrid("movie", MOVIES);

  await act(async () =>
    act11y(await readyCard(/^The Matrix, 1999, TMDB 8\.2$/), "plan"),
  );
  expect(
    await screen.findByText(TRACKING_MESSAGES.write_failed),
  ).toBeOnTheScreen();
  expect(await card(/^The Matrix, 1999, TMDB 8\.2$/)).toBeTruthy();
});

test("Stop tracking a show keeps its history and offers Undo", async () => {
  const show = {
    tracked: true,
    progress: null,
    seasonRatings: [],
    showRating: null,
  };
  mockApi.on("GET", "/api/v1/me/titles?ids=tv:1399", () => ({
    "tv:1399": show,
  }));
  mockApi.on("DELETE", "/api/v1/me/shows/1399/tracking", () => ({
    ok: true,
    undo: { trackedAt: WATCHED_AT },
  }));
  await openGrid("tv", [item(1399, "Game of Thrones")]);

  const got = await card(/^Game of Thrones, .*Tracking$/);
  expect(got.props.accessibilityActions).toEqual([
    { name: "tracking", label: "Stop tracking" },
  ]);
  await act(async () => act11y(got, "tracking"));
  expect(
    await screen.findByText(SHOW_TRACKING_COPY.stopped("Game of Thrones")),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Undo" })).toBeOnTheScreen();
});

test("on Android a long press asks with an alert of the enabled actions", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  mockApi.on("GET", MOVIES_PATH, () => ({
    "movie:603": { planned: false, watchedAt: null, rating: null },
    "movie:604": { planned: false, watchedAt: null, rating: null },
  }));
  await openGrid("movie", [
    { ...MOVIES[0], releaseDate: "2099-01-01" } as V1CatalogItem,
    MOVIES[1] as V1CatalogItem,
  ]);

  fireEvent(await readyCard(/^The Matrix, 1999, TMDB 8\.2$/), "longPress");
  expect(alert).toHaveBeenCalledWith("The Matrix", undefined, [
    expect.objectContaining({ text: "Plan", style: "default" }),
    { text: "Cancel", style: "cancel" },
  ]);
  alert.mockRestore();
  jest.restoreAllMocks();
});

test("signed out, cards read nothing and carry no actions", async () => {
  mockSession = null;
  await openGrid("movie", MOVIES);

  const matrix = await card(/^The Matrix, 1999, TMDB 8\.2$/);
  expect(matrix.props.accessibilityActions).toEqual([]);
  await waitFor(() => expect(mockApi.calls).toEqual([]));
});

test("a failed state read leaves the plain catalog cards", async () => {
  mockApi.on("GET", MOVIES_PATH, () => {
    throw new ApiError(500, "internal", "Something went wrong.");
  });
  await openGrid("movie", MOVIES);

  await waitFor(() =>
    expect(mockApi.callsTo("GET", MOVIES_PATH)).toHaveLength(1),
  );
  const matrix = await card(/^The Matrix, 1999, TMDB 8\.2$/);
  expect(matrix.props.accessibilityActions).toEqual([]);
});
