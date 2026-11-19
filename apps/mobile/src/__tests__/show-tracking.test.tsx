import {
  SEASON_MESSAGES,
  SHOW_PROGRESS_MESSAGES,
  SHOW_TRACKING_COPY,
} from "@bestats/core/tracking/messages";
import type { QueryClient } from "@tanstack/react-query";
import { screen, userEvent, within } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";

import { ApiError } from "@/lib/api";
import { SeasonScreen } from "@/screens/season-screen";
import { ShowScreen } from "@/screens/show-screen";
import {
  createApiMock,
  testQueryClient,
  titleWrapper,
} from "@/test-utils/title-harness";

/**
 * covers: prompts/mobile-title-tracking.md decisions 6 and 7; spec 0033, AC-7
 * (Stop tracking and season writes offer Undo, posting the `show_tracking`
 * and `season` states to their restore routes), AC-14 (personal ratings read
 * "Not rated", never 0, apart from TMDB's); `lib/tracking/AGENTS.md`
 * (marking a season sends no ids, unmarking names the shown ones; an
 * upcoming episode with nothing stored cannot be marked; an unmark keeps the
 * score); AGENTS.md section 11 (a refused write rolls back and says why)
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

const SHOW = {
  id: 1399,
  name: "Game of Thrones",
  overview: "Nine noble families fight.",
  tagline: null,
  posterUrl: null,
  backdropUrl: null,
  firstAirDate: "2011-04-17",
  firstAirYear: 2011,
  lastAirDate: "2019-05-19",
  status: "Ended",
  inProduction: false,
  numberOfSeasons: 2,
  numberOfEpisodes: 20,
  genres: [],
  createdBy: [],
  tmdbRating: 8.4,
  tmdbVoteCount: 100,
  seasons: [
    {
      seasonNumber: 0,
      name: "Specials",
      episodeCount: 1,
      airDate: null,
      posterUrl: null,
      isSpecials: true,
    },
    {
      seasonNumber: 1,
      name: "Season 1",
      episodeCount: 3,
      airDate: "2011-04-17",
      posterUrl: null,
      isSpecials: false,
    },
    {
      seasonNumber: 2,
      name: "Season 2",
      episodeCount: 3,
      airDate: "2012-04-01",
      posterUrl: null,
      isSpecials: false,
    },
  ],
  lastEpisodeToAir: null,
  nextEpisodeToAir: null,
};

const episode = (id: number, number: number, airDate: string | null) => ({
  id,
  seasonNumber: 1,
  episodeNumber: number,
  name: `Episode name ${number}`,
  overview: null,
  airDate,
  stillUrl: null,
  runtimeMinutes: 60,
  tmdbRating: null,
});

const SEASON = {
  show: { id: 1399, name: "Game of Thrones" },
  seasonNumber: 1,
  name: "Season 1",
  overview: null,
  airDate: "2011-04-17",
  posterUrl: null,
  episodes: [
    episode(11, 1, "2011-04-17"),
    episode(12, 2, "2011-04-24"),
    episode(13, 3, "2999-01-01"),
  ],
};

const SHOW_STATE_PATH = "/api/v1/me/titles?ids=tv:1399";
const SEASON_STATE_PATH = "/api/v1/me/shows/1399/seasons/1";
const TRACKED_AT = "2026-01-01T00:00:00+00:00";

let client: QueryClient;
let showState: Record<string, unknown>;
let seasonRows: {
  episodeId: number;
  watchedAt: string | null;
  rating: number | null;
}[];

async function openShow() {
  await renderRouter(
    {
      "shows/[id]": ShowScreen,
      "shows/[id]/season/[number]": SeasonScreen,
    },
    { initialUrl: "/shows/1399", wrapper: titleWrapper(client) },
  );
}

async function openSeason() {
  await renderRouter(
    { "shows/[id]/season/[number]": SeasonScreen },
    { initialUrl: "/shows/1399/season/1", wrapper: titleWrapper(client) },
  );
}

beforeEach(() => {
  client = testQueryClient();
  mockApi.reset();
  mockSession = { user: { email: "a@example.test" } };
  showState = {
    tracked: true,
    progress: { kind: "counted", watched: 1, total: 2, next: null },
    seasonRatings: [],
    showRating: null,
  };
  seasonRows = [];
  mockApi.on("GET", "/api/v1/shows/1399", () => SHOW);
  mockApi.on("GET", "/api/v1/shows/1399/seasons/1", () => SEASON);
  mockApi.on("GET", SHOW_STATE_PATH, () => ({ "tv:1399": showState }));
  mockApi.on("GET", SEASON_STATE_PATH, () => ({ episodes: seasonRows }));
});

test("shows progress, an unrated show as Not rated, and Specials last", async () => {
  await openShow();
  expect(
    await screen.findByText(SHOW_PROGRESS_MESSAGES.counted(1, 2)),
  ).toBeOnTheScreen();
  expect(screen.getByLabelText("Your show rating Not rated")).toBeOnTheScreen();
  expect(screen.getByText("TMDB 8.4")).toBeOnTheScreen();
  const rows = screen.getAllByLabelText(/^(Season \d|Specials),/);
  expect(
    rows.map((row) => String(row.props.accessibilityLabel).split(",")[0]),
  ).toEqual(["Season 1", "Season 2", "Specials"]);
});

test("Stop tracking offers Undo that posts the show_tracking state", async () => {
  mockApi.on("DELETE", "/api/v1/me/shows/1399/tracking", () => {
    showState = { ...showState, tracked: false };
    return { ok: true, undo: { trackedAt: TRACKED_AT } };
  });
  mockApi.on("POST", "/api/v1/me/shows/1399/tracking/restore", () => {
    showState = { ...showState, tracked: true };
    return { ok: true };
  });
  const user = userEvent.setup();
  await openShow();
  await user.press(
    await screen.findByRole("button", {
      name: SHOW_TRACKING_COPY.stopLabel("Game of Thrones"),
    }),
  );
  expect(
    await screen.findByText(SHOW_TRACKING_COPY.stopped("Game of Thrones")),
  ).toBeOnTheScreen();
  expect(await screen.findByText(SHOW_TRACKING_COPY.plan)).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Undo" }));
  expect(
    mockApi.callsTo("POST", "/api/v1/me/shows/1399/tracking/restore")[0].body,
  ).toEqual({
    cleared: {
      kind: "show_tracking",
      showId: 1399,
      undo: { trackedAt: TRACKED_AT },
    },
  });
  expect(
    await screen.findByText(SHOW_TRACKING_COPY.tracking),
  ).toBeOnTheScreen();
});

test("Mark season watched sends no ids and offers Undo", async () => {
  mockApi.on("PUT", "/api/v1/me/shows/1399/seasons/1/watched", () => {
    seasonRows = [
      { episodeId: 11, watchedAt: TRACKED_AT, rating: null },
      { episodeId: 12, watchedAt: TRACKED_AT, rating: null },
    ];
    return {
      ok: true,
      showTracked: false,
      undo: { kind: "unmark", episodeIds: [11, 12] },
    };
  });
  mockApi.on("POST", "/api/v1/me/shows/1399/seasons/1/watched/restore", () => {
    seasonRows = [];
    return { ok: true, showTracked: false };
  });
  const user = userEvent.setup();
  await openSeason();
  await user.press(
    await screen.findByRole("button", { name: "Mark Season 1 watched" }),
  );
  expect(
    mockApi.callsTo("PUT", "/api/v1/me/shows/1399/seasons/1/watched")[0].body,
  ).toEqual({ watched: true });
  expect(await screen.findByText(SEASON_MESSAGES.marked(2))).toBeOnTheScreen();
  expect(screen.getByText("2 of 2 watched")).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Undo" }));
  expect(
    mockApi.callsTo(
      "POST",
      "/api/v1/me/shows/1399/seasons/1/watched/restore",
    )[0].body,
  ).toEqual({
    cleared: {
      kind: "season",
      showId: 1399,
      seasonNumber: 1,
      undo: { kind: "unmark", episodeIds: [11, 12] },
    },
  });
  expect(await screen.findByText("0 of 2 watched")).toBeOnTheScreen();
});

test("unmarking the season names the episodes shown", async () => {
  seasonRows = [
    { episodeId: 11, watchedAt: TRACKED_AT, rating: 7 },
    { episodeId: 12, watchedAt: TRACKED_AT, rating: null },
  ];
  mockApi.on("PUT", "/api/v1/me/shows/1399/seasons/1/watched", () => ({
    ok: true,
    showTracked: false,
    undo: null,
  }));
  const user = userEvent.setup();
  await openSeason();
  await user.press(
    await screen.findByRole("button", { name: "Mark Season 1 watched" }),
  );
  expect(
    mockApi.callsTo("PUT", "/api/v1/me/shows/1399/seasons/1/watched")[0].body,
  ).toEqual({ watched: false, episodeIds: [11, 12, 13] });
});

test("an upcoming episode with nothing stored cannot be marked", async () => {
  await openSeason();
  await screen.findByRole("button", { name: "Mark Season 1 watched" });
  expect(
    screen.queryByRole("button", { name: "Mark Episode name 3 watched" }),
  ).toBeNull();
  expect(screen.getByText("Upcoming")).toBeOnTheScreen();
});

test("unmarking an episode keeps its score", async () => {
  seasonRows = [{ episodeId: 11, watchedAt: TRACKED_AT, rating: 9 }];
  mockApi.on("PUT", "/api/v1/me/episodes/11", () => new Promise(() => {}));
  const user = userEvent.setup();
  await openSeason();
  await user.press(
    await screen.findByRole("button", { name: "Mark Episode name 1 watched" }),
  );
  expect(mockApi.callsTo("PUT", "/api/v1/me/episodes/11")[0].body).toEqual({
    showId: 1399,
    season: 1,
    watched: false,
  });
  expect(
    screen.getByRole("button", { name: "Your score for Episode name 1: 9" }),
  ).toBeOnTheScreen();
  expect(
    screen.getByLabelText("Your season rating 9.0 from 1 rated episode"),
  ).toBeOnTheScreen();
});

test("a refused episode mark rolls back and says why", async () => {
  mockApi.on("PUT", "/api/v1/me/episodes/12", () => {
    throw new ApiError(502, "catalog_unavailable", "Couldn't reach TMDB.");
  });
  const user = userEvent.setup();
  await openSeason();
  await user.press(
    await screen.findByRole("button", { name: "Mark Episode name 2 watched" }),
  );
  expect(await screen.findByText("Couldn't reach TMDB.")).toBeOnTheScreen();
  const row = screen.getByRole("button", {
    name: "Mark Episode name 2 watched",
  });
  expect(within(row).getByText("Mark watched")).toBeOnTheScreen();
});

test("signed out, the show sends no private request", async () => {
  mockSession = null;
  await openShow();
  expect(await screen.findByText("Sign in to track")).toBeOnTheScreen();
  expect(
    mockApi.calls.filter((call) => call.path.startsWith("/api/v1/me/")),
  ).toEqual([]);
});

test("signed out, the season lists its episodes and sends no private request", async () => {
  mockSession = null;
  await openSeason();
  expect(await screen.findByText("1. Episode name 1")).toBeOnTheScreen();
  expect(screen.getByText("Sign in to track")).toBeOnTheScreen();
  expect(
    mockApi.calls.filter((call) => call.path.startsWith("/api/v1/me/")),
  ).toEqual([]);
});
