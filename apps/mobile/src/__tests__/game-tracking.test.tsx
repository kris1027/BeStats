import { GAME_UNDO_MESSAGES } from "@bestats/core/tracking/messages";
import type { QueryClient } from "@tanstack/react-query";
import { screen, userEvent } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";

import { GameScreen } from "@/screens/game-screen";
import {
  createApiMock,
  testQueryClient,
  titleWrapper,
} from "@/test-utils/title-harness";

/**
 * covers: prompts/mobile-title-tracking.md decision 8; spec 0033, AC-6
 * (before release Playing and Finished are off), AC-7 (removing a game and a
 * move to Want to play that cleared a score offer Undo, posting the
 * `game_removed` and `game_status` states), AC-14 (IGDB's rating labelled
 * IGDB); `lib/tracking/AGENTS.md`, Games (a score only on Playing or
 * Finished; a move into Finished with no score opens the sheet)
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

const ref = (id: number, name: string) => ({ id, name });
const GAME = {
  id: 1942,
  name: "The Witcher 3",
  slug: "the-witcher-3",
  coverUrl: null,
  releaseDate: "2015-05-19",
  releaseYear: 2015,
  platforms: [ref(6, "PC")],
  genres: [ref(12, "RPG")],
  themes: [],
  summary: "A monster hunter's tale.",
  gameType: "main_game",
  communityRating: 9.1,
  communityRatingCount: 1000,
  storyline: null,
  artUrl: null,
  screenshotUrls: [],
  trailer: null,
  similarGameIds: [],
  developers: ["CD Projekt Red"],
  publishers: [],
  gameModes: [ref(1, "Single player")],
  playerPerspectives: [],
  franchises: [],
  series: [],
  gameEngines: [],
  platformReleases: [],
};
const GAME_PATH = "/api/v1/games/1942";
const STATE_PATH = "/api/v1/me/titles?ids=game:1942";
const WRITE_PATH = "/api/v1/me/games/1942";
const PREVIOUS = {
  status: "finished",
  rating: 9,
  addedAt: "2026-01-01T00:00:00+00:00",
  startedAt: "2026-01-02T00:00:00+00:00",
  finishedAt: "2026-01-03T00:00:00+00:00",
};

let client: QueryClient;
let state: { status: string | null; rating: number | null };

async function open() {
  await renderRouter(
    { "games/[id]": GameScreen },
    { initialUrl: "/games/1942", wrapper: titleWrapper(client) },
  );
}

const button = (name: string) => screen.findByRole("button", { name });

beforeEach(() => {
  client = testQueryClient();
  mockApi.reset();
  mockSession = { user: { email: "a@example.test" } };
  state = { status: null, rating: null };
  mockApi.on("GET", GAME_PATH, () => GAME);
  mockApi.on("GET", STATE_PATH, () => ({ "game:1942": state }));
});

test("shows IGDB's rating labelled, Facts, and no score before a start", async () => {
  await open();
  expect(await button("Want to play: The Witcher 3")).toBeOnTheScreen();
  expect(screen.getByLabelText("IGDB community rating 9.1")).toBeOnTheScreen();
  expect(screen.getByText("Single player")).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: /^Your score for/ })).toBeNull();
});

test("Finished with no score opens the sheet and sends the status", async () => {
  mockApi.on("PUT", WRITE_PATH, () => new Promise(() => {}));
  const user = userEvent.setup();
  await open();
  await user.press(await button("Finished: The Witcher 3"));
  expect(mockApi.callsTo("PUT", WRITE_PATH)[0].body).toEqual({
    status: "finished",
  });
  expect(await screen.findByText("Your score")).toBeOnTheScreen();
});

test("Playing never opens the sheet", async () => {
  mockApi.on("PUT", WRITE_PATH, () => new Promise(() => {}));
  const user = userEvent.setup();
  await open();
  await user.press(await button("Playing: The Witcher 3"));
  expect(screen.queryByText("Your score")).toBeNull();
  expect(
    await button("Your score for The Witcher 3: Not rated"),
  ).toBeOnTheScreen();
});

test("tapping the pressed status removes the game, with Undo", async () => {
  state = { status: "finished", rating: 9 };
  mockApi.on("DELETE", WRITE_PATH, () => {
    state = { status: null, rating: null };
    return {
      ok: true,
      undo: {
        kind: "removed",
        previous: PREVIOUS,
        removedAt: "2026-02-01T00:00:00+00:00",
      },
    };
  });
  mockApi.on("POST", `${WRITE_PATH}/restore`, () => {
    state = { status: "finished", rating: 9 };
    return { ok: true };
  });
  const user = userEvent.setup();
  await open();
  await user.press(await button("Finished: The Witcher 3"));
  expect(await screen.findByText(GAME_UNDO_MESSAGES.removed)).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Undo" }));
  expect(mockApi.callsTo("POST", `${WRITE_PATH}/restore`)[0].body).toEqual({
    cleared: {
      kind: "game_removed",
      gameId: 1942,
      previous: PREVIOUS,
      removedAt: "2026-02-01T00:00:00+00:00",
    },
  });
  expect(await button("Your score for The Witcher 3: 9")).toBeOnTheScreen();
});

test("Want to play clears the score, with Undo", async () => {
  state = { status: "finished", rating: 9 };
  mockApi.on("PUT", WRITE_PATH, () => {
    state = { status: "want_to_play", rating: null };
    return { ok: true, undo: { kind: "status", previous: PREVIOUS } };
  });
  mockApi.on("POST", `${WRITE_PATH}/restore`, () => {
    state = { status: "finished", rating: 9 };
    return { ok: true };
  });
  const user = userEvent.setup();
  await open();
  await user.press(await button("Want to play: The Witcher 3"));
  expect(
    await screen.findByText(GAME_UNDO_MESSAGES.scoreCleared),
  ).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: /^Your score for/ })).toBeNull();
  await user.press(screen.getByRole("button", { name: "Undo" }));
  expect(mockApi.callsTo("POST", `${WRITE_PATH}/restore`)[0].body).toEqual({
    cleared: { kind: "game_status", gameId: 1942, previous: PREVIOUS },
  });
  expect(await button("Your score for The Witcher 3: 9")).toBeOnTheScreen();
});

test("before release, Playing and Finished are off", async () => {
  mockApi.on("GET", GAME_PATH, () => ({
    ...GAME,
    releaseDate: "2999-01-01",
    releaseYear: 2999,
  }));
  await open();
  expect(await button("Playing: The Witcher 3")).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Finished: The Witcher 3" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Want to play: The Witcher 3" }),
  ).toBeEnabled();
});

test("signed out, it offers Sign in and sends no private request", async () => {
  mockSession = null;
  await open();
  expect(await screen.findByText("Sign in to track")).toBeOnTheScreen();
  expect(
    mockApi.calls.filter((call) => call.path.startsWith("/api/v1/me/")),
  ).toEqual([]);
});
