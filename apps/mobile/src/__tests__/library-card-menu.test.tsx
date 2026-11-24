import { SHOW_TRACKING_COPY } from "@bestats/core/tracking/messages";
import {
  act,
  fireEvent,
  screen,
  userEvent,
  waitFor,
} from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import type { PropsWithChildren } from "react";
import { Alert, Platform } from "react-native";

import { MediaTypeProvider } from "@/lib/media-type";
import { LibraryScreen } from "@/screens/library-screen";
import {
  createApiMock,
  testQueryClient,
  titleWrapper,
} from "@/test-utils/title-harness";
import { CARD_FONT_SCALE_CAP } from "@/theme/font-scale";

/**
 * covers: prompts/mobile-look-library.md, AC-4 (the type's menu reaches
 * screen readers and, on Android, a long press alert), AC-5 (a menu write
 * sends the title screen's request and the page is read again, so the
 * server places the card), AC-6 (a failed card opens with no menu, a
 * missing one does not open), AC-7 (the quick action stays its own button)
 * and AC-8 (the card's text has the card's width and the text size cap).
 */
const mockApi = createApiMock();
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  apiRequest: (...args: [string, unknown, Record<string, unknown>]) =>
    mockApi.handle(...args),
}));

jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { user: { email: "a@example.test" } },
    loading: false,
  }),
}));

function libraryPath(type: string, path: string) {
  return `/api/v1/me/library?${new URLSearchParams({ type, path, page: "1" })}`;
}

function answer(type: string, path: string, entries: unknown[]) {
  return {
    type,
    path,
    page: 1,
    pageSize: 24,
    entries,
    total: entries.length,
    failedCount: 0,
    capped: false,
    nextPage: null,
  };
}

const PLANNED_MOVIE = {
  type: "movie",
  id: 603,
  path: "/movies/603",
  user: { planned: true, watchedAt: null, rating: null },
  card: {
    kind: "title",
    name: "The Matrix",
    posterUrl: null,
    tmdbRating: 8.2,
    releaseDate: "1999-03-31",
  },
};

const UP_NEXT_SHOW = {
  type: "tv",
  id: 1399,
  path: "/shows/1399",
  user: { tracked: true, progress: null, seasonRatings: [], showRating: null },
  card: {
    kind: "title",
    name: "Game of Thrones",
    posterUrl: null,
    tmdbRating: 8.4,
    place: { page: "watchlist", next: { season: 2, episode: 3 } },
  },
};

const PLAYING_GAME = {
  type: "game",
  id: 1942,
  path: "/games/1942",
  user: { status: "playing", rating: null, startedAt: null, finishedAt: null },
  card: {
    kind: "title",
    name: "The Witcher 3",
    coverUrl: null,
    communityRating: 92,
    releaseDate: "2015-05-19",
    startedAt: null,
    finishedAt: null,
  },
};

let client = testQueryClient();

function wrapper({ children }: PropsWithChildren) {
  const Titles = titleWrapper(client);
  return (
    <Titles>
      <MediaTypeProvider>{children}</MediaTypeProvider>
    </Titles>
  );
}

/** Opens one library page whose reads answer `entries` until `leave()`. */
async function openPage(type: string, path: string, entries: unknown[]) {
  let shown = entries;
  mockApi.on("GET", libraryPath(type, path), () => answer(type, path, shown));
  await renderRouter(
    {
      library: LibraryScreen,
      index: () => null,
      "movies/[id]": () => null,
      "shows/[id]": () => null,
      "games/[id]": () => null,
    },
    {
      initialUrl: `/library?${new URLSearchParams({ type, path })}`,
      wrapper,
    },
  );
  return {
    leave: () => {
      shown = [];
    },
    back: () => {
      shown = entries;
    },
  };
}

const link = (name: RegExp) => screen.findByRole("link", { name });

function act11y(element: ReturnType<typeof screen.getByRole>, name: string) {
  fireEvent(element, "accessibilityAction", {
    nativeEvent: { actionName: name },
  });
}

beforeEach(() => {
  client = testQueryClient();
  mockApi.reset();
});

test("a Watchlist movie offers the catalog menu beside its quick action", async () => {
  const page = await openPage("movie", "/watchlist", [PLANNED_MOVIE]);
  mockApi.on("PUT", "/api/v1/me/movies/603/watchlist", () => {
    page.leave();
    return { ok: true };
  });

  const matrix = await link(/^The Matrix/);
  expect(matrix.props.accessibilityActions).toEqual([
    { name: "plan", label: "Remove from plan" },
    { name: "watched", label: "Mark watched" },
  ]);
  // The quick action stays its own button, outside the link.
  expect(
    screen.getByRole("button", { name: "Remove The Matrix from Watchlist" }),
  ).toBeOnTheScreen();

  const reads = mockApi.callsTo("GET", libraryPath("movie", "/watchlist"));
  const before = reads.length;
  await act(async () => act11y(matrix, "plan"));

  expect(
    mockApi.callsTo("PUT", "/api/v1/me/movies/603/watchlist")[0]?.body,
  ).toEqual({ planned: false });
  // The page is read again, so the server, not the app, moves the card.
  await waitFor(() =>
    expect(
      mockApi.callsTo("GET", libraryPath("movie", "/watchlist")).length,
    ).toBeGreaterThan(before),
  );
  await waitFor(() =>
    expect(screen.queryByRole("link", { name: /^The Matrix/ })).toBeNull(),
  );
});

test("Mark watched stays out of the menu before the release day", async () => {
  await openPage("movie", "/coming-soon", [
    {
      ...PLANNED_MOVIE,
      card: { ...PLANNED_MOVIE.card, releaseDate: "2099-01-01" },
    },
  ]);
  const matrix = await link(/^The Matrix/);
  expect(matrix.props.accessibilityActions).toEqual([
    { name: "plan", label: "Remove from plan" },
  ]);
});

test("Stop tracking from an Up next card offers Undo", async () => {
  await openPage("tv", "/up-next", [UP_NEXT_SHOW]);
  mockApi.on("DELETE", "/api/v1/me/shows/1399/tracking", () => ({
    ok: true,
    undo: { trackedAt: "2026-01-01T00:00:00Z" },
  }));

  const show = await link(/^Game of Thrones/);
  expect(show.props.accessibilityActions).toEqual([
    { name: "tracking", label: "Stop tracking" },
  ]);
  await act(async () => act11y(show, "tracking"));
  expect(
    await screen.findByText(SHOW_TRACKING_COPY.stopped("Game of Thrones")),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Undo" })).toBeOnTheScreen();
});

test("Undo closes its toast even after the card has left the page", async () => {
  const user = userEvent.setup();
  const page = await openPage("tv", "/up-next", [UP_NEXT_SHOW]);
  mockApi.on("DELETE", "/api/v1/me/shows/1399/tracking", () => {
    page.leave();
    return { ok: true, undo: { trackedAt: "2026-01-01T00:00:00Z" } };
  });
  mockApi.on("POST", "/api/v1/me/shows/1399/tracking/restore", () => {
    page.back();
    return { ok: true };
  });

  await act(async () => act11y(await link(/^Game of Thrones/), "tracking"));
  // The server moved the card off Up next, so the card that asked is gone.
  await waitFor(() =>
    expect(screen.queryByRole("link", { name: /^Game of Thrones/ })).toBeNull(),
  );
  await user.press(screen.getByRole("button", { name: "Undo" }));

  expect(
    mockApi.callsTo("POST", "/api/v1/me/shows/1399/tracking/restore")[0]?.body,
  ).toEqual({
    cleared: {
      kind: "show_tracking",
      showId: 1399,
      undo: { trackedAt: "2026-01-01T00:00:00Z" },
    },
  });
  await waitFor(() =>
    expect(
      screen.queryByText(SHOW_TRACKING_COPY.stopped("Game of Thrones")),
    ).toBeNull(),
  );
  expect(await link(/^Game of Thrones/)).toBeTruthy();
});

test("a Playing game offers Remove, which sends the title screen's delete", async () => {
  await openPage("game", "/playing", [PLAYING_GAME]);
  mockApi.on("DELETE", "/api/v1/me/games/1942", () => ({
    ok: true,
    undo: {
      kind: "removed",
      previous: { ...PLAYING_GAME.user, addedAt: "2026-01-01T00:00:00Z" },
      removedAt: "2026-02-01T00:00:00Z",
    },
  }));

  const witcher = await link(/^The Witcher 3/);
  expect(witcher.props.accessibilityActions).toEqual([
    { name: "status", label: "Remove from your games" },
  ]);
  await act(async () => act11y(witcher, "status"));
  expect(mockApi.callsTo("DELETE", "/api/v1/me/games/1942")).toHaveLength(1);
});

test("a failed card opens with no menu; a missing card does not open", async () => {
  await openPage("movie", "/watchlist", [
    { ...PLANNED_MOVIE, card: null },
    {
      ...PLANNED_MOVIE,
      id: 604,
      path: "/movies/604",
      card: { kind: "missing" },
    },
  ]);

  const links = await screen.findAllByRole("link");
  expect(links).toHaveLength(1);
  expect(links[0]?.props.accessibilityActions).toEqual([]);
});

test("on Android a long press asks with an alert of the enabled actions", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await openPage("movie", "/coming-soon", [
    {
      ...PLANNED_MOVIE,
      card: { ...PLANNED_MOVIE.card, releaseDate: "2099-01-01" },
    },
  ]);

  fireEvent(await link(/^The Matrix/), "longPress");
  expect(alert).toHaveBeenCalledWith("The Matrix", undefined, [
    expect.objectContaining({ text: "Remove from plan", style: "destructive" }),
    { text: "Cancel", style: "cancel" },
  ]);
  alert.mockRestore();
  jest.restoreAllMocks();
});

test("a long title keeps the card's width and the text size cap", async () => {
  const name = "A Very Long Title That Would Otherwise Widen Its Column";
  await openPage("movie", "/watchlist", [
    { ...PLANNED_MOVIE, card: { ...PLANNED_MOVIE.card, name } },
  ]);

  // The poster's missing image tile names the title too; the line under the
  // poster is the last.
  const titles = await screen.findAllByText(name);
  const title = titles[titles.length - 1];
  expect(title?.props.numberOfLines).toBe(2);
  expect(title?.props.maxFontSizeMultiplier).toBe(CARD_FONT_SCALE_CAP);
  // The nearest ancestor that sets a width is the text block, not the card
  // link: the link's function style may not reach layout.
  let block = title?.parent ?? null;
  while (block && typeof block.props.style?.width !== "number") {
    block = block.parent;
  }
  expect(block?.props.accessibilityRole).toBeUndefined();
  expect(block?.props.style.width).toBeGreaterThan(0);
});
