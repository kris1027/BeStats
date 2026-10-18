import { render, screen, within } from "@testing-library/react";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: prompts/home-parallax-landing.md, AC-1, AC-2, AC-4, AC-5, AC-6
 *
 * Each landing section's streamed body on its own: how many titles it shows
 * from page 1, in what order, the Upcoming rows' split and labels, the
 * missing artwork fallback, and the failure and empty states that stay
 * inside one section. The list read and the status badge are replaced;
 * `TmdbError` is the real one.
 */
const read = vi.fn();

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/tmdb", async () => ({
  TmdbError: (await import("@/lib/tmdb/errors")).TmdbError,
}));
vi.mock("@/lib/catalog-list-read", () => ({
  readTaggedCatalogList: (...args: unknown[]) => read(...args),
}));
vi.mock("@/lib/tracking/episode-state", () => ({
  requestTodayUtc: () => "2026-10-18",
}));
vi.mock("./landing-badge", () => ({
  LandingBadge: ({ item }: { item: { id: number } }) => (
    <span data-testid="badge">{item.id}</span>
  ),
}));

const { TmdbError } = await import("@/lib/tmdb/errors");
const { landingSlots } = await import("@/lib/catalog/landing");
const { TrendingItems } = await import("./trending-pin");
const { PopularItems } = await import("./popular-grid");
const { NowBlurb, NowItems } = await import("./now-playing-columns");
const { UpcomingItems } = await import("./upcoming-rows");
const { TopRatedItems } = await import("./top-rated-list");

const MOVIES = landingSlots("movie");
const TV = landingSlots("tv");

function movies(count: number, extra: Record<string, unknown> = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    title: `Movie ${index + 1}`,
    posterUrl: `https://image.tmdb.org/t/p/w500/p${index + 1}.jpg`,
    backdropUrl: `https://image.tmdb.org/t/p/w1280/b${index + 1}.jpg`,
    releaseDate: "2026-11-06",
    releaseYear: 2026,
    tmdbRating: 7.5,
    genreIds: [],
    ...extra,
  }));
}

function shows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Show ${index + 1}`,
    posterUrl: null,
    backdropUrl: null,
    firstAirDate: "2019-04-01",
    firstAirYear: 2019,
    tmdbRating: 8.1,
    genreIds: [],
  }));
}

function moviePage(results: unknown[]) {
  return {
    mediaType: "movie",
    paged: { results, page: 1, totalPages: 1, totalResults: results.length },
  };
}

function tvPage(results: unknown[]) {
  return {
    mediaType: "tv",
    paged: { results, page: 1, totalPages: 1, totalResults: results.length },
  };
}

function titles(container: HTMLElement) {
  return within(container)
    .getAllByRole("link")
    .map((link) => link.textContent);
}

afterEach(() => read.mockReset());

describe("each section's count (AC-2)", () => {
  it.each([
    ["Trending", TrendingItems, MOVIES.trending, 9],
    ["Popular", PopularItems, MOVIES.popular, 14],
    ["Now playing", NowItems, MOVIES.now, 12],
    ["Top rated", TopRatedItems, MOVIES.top, 8],
  ] as const)("%s shows the first %#", async (_name, Section, list, count) => {
    read.mockResolvedValue(moviePage(movies(20)));

    const { container } = render(await Section({ list }));

    expect(read).toHaveBeenCalledWith(list, 1);
    expect(titles(container)).toEqual(
      Array.from({ length: count }, (_, index) => `Movie ${index + 1}`),
    );
  });

  it("never pads a short list", async () => {
    read.mockResolvedValue(moviePage(movies(3)));

    const { container } = render(await PopularItems({ list: MOVIES.popular }));

    expect(titles(container)).toHaveLength(3);
  });
});

describe("the ranked sections", () => {
  it("puts Trending in an ordered list, numbers hidden from assistive technology", async () => {
    read.mockResolvedValue(moviePage(movies(9)));

    const { container } = render(
      await TrendingItems({ list: MOVIES.trending }),
    );

    const list = container.querySelector("ol");
    expect(list).toHaveAttribute("data-pin-track");
    expect(within(list as HTMLElement).getAllByRole("listitem")).toHaveLength(
      9,
    );
    const ranks = container.querySelectorAll(".rank-outline");
    expect([...ranks].map((rank) => rank.textContent)).toEqual(
      Array.from({ length: 9 }, (_, index) => String(index + 1)),
    );
    for (const rank of ranks) {
      expect(rank).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("puts Top rated in an ordered list", async () => {
    read.mockResolvedValue(moviePage(movies(8)));

    const { container } = render(await TopRatedItems({ list: MOVIES.top }));

    expect(container.querySelector("ol")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Movie 8" })).toHaveAttribute(
      "href",
      "/movies/8",
    );
  });
});

describe("Upcoming rows (AC-4)", () => {
  it("splits 1 to 10 and 11 to 20 across two rows moving opposite ways", async () => {
    read.mockResolvedValue(moviePage(movies(20)));

    const { container } = render(
      await UpcomingItems({ list: MOVIES.upcoming }),
    );

    const rows = container.querySelectorAll("[data-marquee]");
    expect([...rows].map((row) => row.getAttribute("data-marquee"))).toEqual([
      "1",
      "-1",
    ]);
    expect(titles(rows[0] as HTMLElement)).toEqual(
      Array.from({ length: 10 }, (_, index) => `Movie ${index + 1}`),
    );
    expect(titles(rows[1] as HTMLElement)).toEqual(
      Array.from({ length: 10 }, (_, index) => `Movie ${index + 11}`),
    );
  });

  it("keeps one row when there are ten titles or fewer", async () => {
    read.mockResolvedValue(moviePage(movies(10)));

    const { container } = render(
      await UpcomingItems({ list: MOVIES.upcoming }),
    );

    expect(container.querySelectorAll("[data-marquee]")).toHaveLength(1);
  });

  it("labels a movie with its UTC release day, the year only outside this one", async () => {
    read.mockResolvedValue(
      moviePage([
        ...movies(1),
        ...movies(1, { id: 2, title: "Later", releaseDate: "2027-01-08" }),
      ]),
    );

    render(await UpcomingItems({ list: MOVIES.upcoming }));

    expect(screen.getByText("Nov 6")).toBeInTheDocument();
    expect(screen.getByText("Jan 8, 2027")).toBeInTheDocument();
  });

  it("labels a show with its first air year", async () => {
    read.mockResolvedValue(tvPage(shows(2)));

    render(await UpcomingItems({ list: TV.upcoming }));

    expect(screen.getAllByText("2019")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Show 1" })).toHaveAttribute(
      "href",
      "/shows/1",
    );
  });
});

describe("missing artwork (AC-5)", () => {
  it("falls back to the poster on a wide card with no backdrop", async () => {
    read.mockResolvedValue(moviePage(movies(1, { backdropUrl: null })));

    const { container } = render(
      await UpcomingItems({ list: MOVIES.upcoming }),
    );

    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      "p1.jpg",
    );
  });

  it("shows the flat tile, not an invented image, with neither", async () => {
    read.mockResolvedValue(tvPage(shows(1)));

    const { container } = render(await UpcomingItems({ list: TV.upcoming }));

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("link", { name: "Show 1" })).toBeInTheDocument();
  });
});

describe("one section's failure (AC-6)", () => {
  it.each([
    ["Trending", TrendingItems, MOVIES.trending],
    ["Popular", PopularItems, MOVIES.popular],
    ["Now playing", NowItems, MOVIES.now],
    ["Upcoming", UpcomingItems, MOVIES.upcoming],
    ["Top rated", TopRatedItems, MOVIES.top],
  ] as const)(
    "keeps a TMDB failure inside %s, with Try again",
    async (_name, Section, list) => {
      read.mockRejectedValue(new TmdbError("upstream", "/x", "503", 503));

      render(await Section({ list }));

      expect(
        screen.getByText(`Couldn't load ${list.rowTitle}`),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
        "href",
        "/movies",
      );
    },
  );

  it("says so in one line when a list is empty", async () => {
    read.mockResolvedValue(moviePage([]));

    render(await TopRatedItems({ list: MOVIES.top }));

    expect(screen.getByText("Nothing here right now.")).toBeInTheDocument();
  });

  it("rethrows anything that is not a TMDB failure", async () => {
    read.mockRejectedValue(new TypeError("a bug"));

    await expect(PopularItems({ list: MOVIES.popular })).rejects.toThrow(
      "a bug",
    );
  });
});

describe("the sidebar count (decision 12)", () => {
  it("counts what the grid renders", async () => {
    read.mockResolvedValue(moviePage(movies(20)));

    const blurb = await NowBlurb({ list: MOVIES.now });
    expect(blurb).not.toBeNull();
    render(blurb as React.ReactElement);

    expect(
      screen.getByText("12 films in cinemas this week."),
    ).toBeInTheDocument();
  });

  it("says nothing when the list failed", async () => {
    read.mockRejectedValue(new TmdbError("upstream", "/x", "503", 503));

    expect(await NowBlurb({ list: TV.now })).toBeNull();
  });
});
