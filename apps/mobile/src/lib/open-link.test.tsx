import type { V1TitleExtras } from "@bestats/core/api/v1/extras";
import { ALL_WATCH_OPTIONS_LABEL } from "@bestats/core/catalog/where-to-watch";
import {
  render,
  renderHook,
  screen,
  userEvent,
  waitFor,
} from "@testing-library/react-native";
import * as Linking from "expo-linking";

import { TrailerButton, WhereToWatch } from "@/components/title-extras";
import { testQueryClient, titleWrapper } from "@/test-utils/title-harness";

import { OPEN_LINK_FAILED, useOpenLink } from "./open-link";

/**
 * covers: prompts/mobile-look-review-fixes.md, R1 and decision 1 (a refused
 * `openURL` shows the toast, on the title page's Trailer and "All options on
 * TMDB" links too, and leaves no unhandled rejection; a URL built from a
 * missing config fails into the same toast)
 */
jest.mock("expo-linking", () => ({ openURL: jest.fn() }));

const TRAILER_KEY = "dQw4w9WgXcQ";
const WATCH_LINK = "https://www.themoviedb.org/movie/1/watch?locale=GB";

const extras: V1TitleExtras = {
  region: { code: "GB", name: "United Kingdom" },
  trailer: { key: TRAILER_KEY, name: "Trailer" },
  ageRating: null,
  watch: {
    link: WATCH_LINK,
    stream: [{ id: 8, name: "Netflix", logoUrl: null }],
    free: [],
    rentOrBuy: [],
  },
  recommendations: [],
};

const loaded = {
  isPending: false,
  isError: false,
  data: extras,
  refetch: () => undefined,
};

let unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => {
  unhandled.push(reason);
};

beforeEach(() => {
  unhandled = [];
  process.on("unhandledRejection", onUnhandled);
  jest.mocked(Linking.openURL).mockReset();
});

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
});

/** Lets any rejection nobody caught reach the process listener. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("a refused link shows the toast and leaves no unhandled rejection", async () => {
  jest.mocked(Linking.openURL).mockRejectedValueOnce(new Error("no handler"));
  const { result } = await renderHook(() => useOpenLink(), {
    wrapper: titleWrapper(testQueryClient()),
  });

  expect(result.current("https://example.test/a")).toBeUndefined();

  await waitFor(() =>
    expect(screen.getByText(OPEN_LINK_FAILED)).toBeOnTheScreen(),
  );
  await settle();
  expect(unhandled).toEqual([]);
});

test("a URL built from a missing config fails into the toast, not a throw", async () => {
  const { result } = await renderHook(() => useOpenLink(), {
    wrapper: titleWrapper(testQueryClient()),
  });

  expect(() =>
    result.current(() => {
      throw new Error("Missing EXPO_PUBLIC_API_BASE_URL");
    }),
  ).not.toThrow();

  await waitFor(() =>
    expect(screen.getByText(OPEN_LINK_FAILED)).toBeOnTheScreen(),
  );
  expect(Linking.openURL).not.toHaveBeenCalled();
  await settle();
  expect(unhandled).toEqual([]);
});

test("an opened link shows no toast", async () => {
  jest.mocked(Linking.openURL).mockResolvedValueOnce(true);
  await render(<TrailerButton trailer={extras.trailer} title="Heat" />, {
    wrapper: titleWrapper(testQueryClient()),
  });

  await userEvent.press(screen.getByText("Trailer"));
  await settle();

  expect(Linking.openURL).toHaveBeenCalledWith(
    `https://www.youtube.com/watch?v=${TRAILER_KEY}`,
  );
  expect(screen.queryByText(OPEN_LINK_FAILED)).toBeNull();
});

test("the Trailer button says so when the phone cannot open YouTube", async () => {
  jest.mocked(Linking.openURL).mockRejectedValueOnce(new Error("no handler"));
  await render(<TrailerButton trailer={extras.trailer} title="Heat" />, {
    wrapper: titleWrapper(testQueryClient()),
  });

  await userEvent.press(screen.getByText("Trailer"));

  expect(await screen.findByText(OPEN_LINK_FAILED)).toBeOnTheScreen();
  await settle();
  expect(unhandled).toEqual([]);
});

test("All options on TMDB says so when the phone cannot open it", async () => {
  jest.mocked(Linking.openURL).mockRejectedValueOnce(new Error("no handler"));
  await render(<WhereToWatch read={loaded} />, {
    wrapper: titleWrapper(testQueryClient()),
  });

  await userEvent.press(
    screen.getByRole("link", {
      name: `${ALL_WATCH_OPTIONS_LABEL}, opens in the browser`,
    }),
  );

  expect(Linking.openURL).toHaveBeenCalledWith(WATCH_LINK);
  expect(await screen.findByText(OPEN_LINK_FAILED)).toBeOnTheScreen();
  await settle();
  expect(unhandled).toEqual([]);
});
