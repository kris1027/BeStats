import { JUSTWATCH_ATTRIBUTION } from "@bestats/core/legal/operator";
import type { QueryClient } from "@tanstack/react-query";
import { screen, userEvent } from "@testing-library/react-native";
import * as Linking from "expo-linking";
import { renderRouter } from "expo-router/testing-library";

import { GameScreen } from "@/screens/game-screen";
import { MovieScreen } from "@/screens/movie-screen";
import {
  createApiMock,
  testQueryClient,
  titleWrapper,
} from "@/test-utils/title-harness";

/**
 * covers: prompts/mobile-look-title-extras.md, AC-1 (Trailer opens YouTube,
 * none without a trailer), AC-2 (the age pill spoken with its country),
 * AC-3 (Where to watch names the country, its groups, TMDB's link and the
 * JustWatch credit, and the empty line), AC-4 (More like this cards, a
 * game's from its similar read, none when empty) and AC-5 (a failed extras
 * read keeps the title and retries only the extras)
 */
const mockApi = createApiMock();
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  apiRequest: (...args: [string, unknown, Record<string, unknown>]) =>
    mockApi.handle(...args),
}));
jest.mock("@/lib/session", () => ({ useSession: () => ({ session: null }) }));
// Only `openURL` is replaced: Expo Router reads the rest of expo-linking.
jest.mock("expo-linking", () => ({
  ...jest.requireActual("expo-linking"),
  openURL: jest.fn(),
}));

const MOVIE = {
  id: 603,
  title: "The Matrix",
  originalTitle: "The Matrix",
  overview: "A hacker learns the truth.",
  tagline: null,
  releaseDate: "1999-03-31",
  releaseYear: 1999,
  runtimeMinutes: 136,
  status: "Released",
  genres: [{ id: 28, name: "Action" }],
  posterUrl: null,
  backdropUrl: null,
  tmdbRating: 8.2,
  tmdbVoteCount: 1000,
  directors: [],
  writers: [],
  originalLanguage: "en",
  budget: null,
  revenue: null,
  productionCompanies: [],
  cast: [],
};

const card = (id: number, title: string) => ({
  id,
  title,
  year: 2003,
  releaseDate: "2003-05-15",
  posterUrl: null,
  communityRating: 7,
});

const EXTRAS = {
  region: { code: "PL", name: "Poland" },
  trailer: { key: "vKQi3bBA1y8", name: "Official Trailer" },
  ageRating: "16",
  watch: {
    link: "https://www.themoviedb.org/movie/603/watch?locale=PL",
    stream: [{ id: 8, name: "Netflix", logoUrl: null }],
    free: [],
    rentOrBuy: [
      {
        id: 2,
        name: "Apple TV",
        logoUrl: "https://image.tmdb.org/t/p/w92/apple.png",
      },
    ],
  },
  recommendations: [card(604, "The Matrix Reloaded")],
};

const MOVIE_PATH = "/api/v1/movies/603";
const EXTRAS_PATH = "/api/v1/movies/603/extras";

let client: QueryClient;

beforeEach(() => {
  client = testQueryClient();
  mockApi.reset();
  jest.mocked(Linking.openURL).mockClear();
  mockApi.on("GET", MOVIE_PATH, () => MOVIE);
  mockApi.on("GET", EXTRAS_PATH, () => EXTRAS);
});

async function openMovie() {
  await renderRouter(
    { "movies/[id]": MovieScreen },
    { initialUrl: "/movies/603", wrapper: titleWrapper(client) },
  );
}

test("shows the trailer, age pill, Where to watch and More like this", async () => {
  await openMovie();
  expect(
    await screen.findByLabelText("Age rating in Poland: 16, Action, Released"),
  ).toBeOnTheScreen();
  expect(screen.getByText("16")).toBeOnTheScreen();

  expect(screen.getByText("Where to watch in Poland")).toBeOnTheScreen();
  expect(screen.getByText("Stream")).toBeOnTheScreen();
  expect(screen.getByText("Netflix")).toBeOnTheScreen();
  expect(screen.getByText("Rent or buy")).toBeOnTheScreen();
  expect(screen.getByLabelText("Apple TV")).toBeOnTheScreen();
  expect(screen.queryByText("Free")).toBeNull();
  expect(screen.getByText(JUSTWATCH_ATTRIBUTION)).toBeOnTheScreen();
  expect(screen.getByText("More like this")).toBeOnTheScreen();
  expect(
    screen.getByRole("link", { name: /^The Matrix Reloaded, 2003/ }),
  ).toBeOnTheScreen();

  const user = userEvent.setup();
  await user.press(
    screen.getByRole("button", {
      name: "Play the The Matrix trailer on YouTube",
    }),
  );
  expect(Linking.openURL).toHaveBeenCalledWith(
    "https://www.youtube.com/watch?v=vKQi3bBA1y8",
  );
  await user.press(
    screen.getByRole("link", {
      name: "All options on TMDB, opens in the browser",
    }),
  );
  expect(Linking.openURL).toHaveBeenLastCalledWith(EXTRAS.watch.link);
});

test("says the country has nothing and leaves out what TMDB lacks", async () => {
  mockApi.on("GET", EXTRAS_PATH, () => ({
    ...EXTRAS,
    trailer: null,
    ageRating: null,
    watch: null,
    recommendations: [],
  }));
  await openMovie();
  expect(
    await screen.findByText("Not streaming in Poland right now."),
  ).toBeOnTheScreen();
  expect(screen.getByLabelText("Action, Released")).toBeOnTheScreen();
  expect(screen.queryByText("Trailer")).toBeNull();
  expect(screen.queryByText("More like this")).toBeNull();
  expect(screen.queryByText("All options on TMDB")).toBeNull();
  expect(screen.getByText(JUSTWATCH_ATTRIBUTION)).toBeOnTheScreen();
});

test("a failed extras read keeps the movie and retries only the extras", async () => {
  let fail = true;
  mockApi.on("GET", EXTRAS_PATH, () => {
    if (fail) throw new Error("down");
    return EXTRAS;
  });
  await openMovie();
  expect(
    await screen.findByText("Couldn't load where to watch from TMDB."),
  ).toBeOnTheScreen();
  expect(
    screen.getByText("Couldn't load recommendations from TMDB."),
  ).toBeOnTheScreen();
  expect(screen.getByText("A hacker learns the truth.")).toBeOnTheScreen();
  expect(screen.queryByText("Trailer")).toBeNull();

  fail = false;
  const user = userEvent.setup();
  await user.press(screen.getAllByRole("button", { name: "Try again" })[0]);
  expect(await screen.findByText("Where to watch in Poland")).toBeOnTheScreen();
  expect(mockApi.callsTo("GET", MOVIE_PATH)).toHaveLength(1);
  expect(mockApi.callsTo("GET", EXTRAS_PATH)).toHaveLength(2);
});

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
  trailer: { key: "c0i88t0Kacs", name: "Launch Trailer" },
  similarGameIds: [1, 2],
  developers: [],
  publishers: [],
  gameModes: [],
  playerPerspectives: [],
  franchises: [],
  series: [],
  gameEngines: [],
  platformReleases: [],
};

async function openGame() {
  await renderRouter(
    { "games/[id]": GameScreen },
    { initialUrl: "/games/1942", wrapper: titleWrapper(client) },
  );
}

test("a game opens its trailer and shows its similar games", async () => {
  mockApi.on("GET", "/api/v1/games/1942", () => GAME);
  mockApi.on("GET", "/api/v1/games/1942/similar", () => ({
    results: [card(1, "Dragon Age")],
  }));
  await openGame();
  expect(
    await screen.findByRole("link", { name: /^Dragon Age, 2003/ }),
  ).toBeOnTheScreen();
  const user = userEvent.setup();
  await user.press(
    screen.getByRole("button", {
      name: "Play the The Witcher 3 trailer on YouTube",
    }),
  );
  expect(Linking.openURL).toHaveBeenCalledWith(
    "https://www.youtube.com/watch?v=c0i88t0Kacs",
  );
});

test("a game with no similar ids asks for none and shows no section", async () => {
  mockApi.on("GET", "/api/v1/games/1942", () => ({
    ...GAME,
    trailer: { key: "bad key!", name: "Trailer" },
    similarGameIds: [],
  }));
  await openGame();
  expect(await screen.findByText("A monster hunter's tale.")).toBeOnTheScreen();
  expect(screen.queryByText("More like this")).toBeNull();
  expect(screen.queryByText("Trailer")).toBeNull();
  expect(mockApi.callsTo("GET", "/api/v1/games/1942/similar")).toHaveLength(0);
});
