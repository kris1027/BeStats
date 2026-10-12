import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0022, AC-9, AC-11, AC-12, AC-13, AC-14, AC-18
 *
 * The extras slots on their own: the region picks the entry after the read,
 * an empty or missing value leaves its piece out, and a `TmdbError` (a 404
 * included) stays inside the slot that asked, as a one line error with a
 * Retry to the title page. The reads, the region and the cards are replaced;
 * `TmdbError` is the real one.
 */
const readMovie = vi.fn();
const readTv = vi.fn();
const region = vi.fn();

vi.mock("@/lib/tmdb", async () => ({
  TmdbError: (await import("@/lib/tmdb/errors")).TmdbError,
  getMovieExtras: (...args: unknown[]) => readMovie(...args),
  getTvExtras: (...args: unknown[]) => readTv(...args),
}));
vi.mock("@/lib/region", () => ({ getVisitorRegion: () => region() }));
vi.mock("@/components/catalog/list-cards", () => ({
  MovieListCard: ({
    movie,
    returnPath,
  }: {
    movie: { title: string };
    returnPath: string;
  }) => <span data-return={returnPath}>{movie.title}</span>,
  ShowListCard: ({ show }: { show: { name: string } }) => (
    <span>{show.name}</span>
  ),
}));

const { TmdbError } = await import("@/lib/tmdb/errors");
const { JUSTWATCH_ATTRIBUTION } = await import("@/lib/legal/operator");
const {
  AgeRatingSlotContent,
  MoreLikeThisContent,
  TrailerSlotContent,
  WhereToWatchContent,
} = await import("./title-extras");

const POLAND = { code: "PL", name: "Poland" };
const MOVIE = { mediaType: "movie", id: 550 } as const;

function provider(id: number, name: string) {
  return { id, name, logoUrl: `https://image.tmdb.org/t/p/w92/${id}.png` };
}

function extras(overrides: Record<string, unknown> = {}) {
  return {
    trailer: { key: "dfeUzm6KF4g", name: "Official Trailer" },
    recommendations: {
      mediaType: "movie",
      paged: {
        page: 1,
        totalPages: 2,
        totalResults: 40,
        results: Array.from({ length: 20 }, (_, index) => ({
          id: index + 1,
          title: `Movie ${index + 1}`,
        })),
      },
    },
    watchProviders: {
      PL: {
        link: "https://www.themoviedb.org/movie/550/watch?locale=PL",
        stream: [provider(8, "Netflix")],
        free: [],
        rentOrBuy: [
          provider(10, "Amazon Video"),
          { ...provider(11, "No Logo"), logoUrl: null },
        ],
      },
      US: {
        link: "https://www.themoviedb.org/movie/550/watch?locale=US",
        stream: [provider(9, "Hulu")],
        free: [],
        rentOrBuy: [],
      },
    },
    ageRatings: { PL: "18", US: "R" },
    ...overrides,
  };
}

beforeEach(() => {
  // The row's scroller measures itself; jsdom has no ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  readMovie.mockReset();
  readTv.mockReset();
  region.mockReset();
});

describe("TrailerSlotContent (AC-11)", () => {
  it("renders the Trailer button for a title with a trailer", async () => {
    readMovie.mockResolvedValue(extras());

    render(await TrailerSlotContent({ ...MOVIE, title: "Fight Club" }));

    expect(readMovie).toHaveBeenCalledWith(550);
    expect(screen.getByRole("button", { name: "Trailer" })).toBeVisible();
    // The player does not exist until the dialog opens.
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("renders nothing with no trailer, or when the read failed (AC-18)", async () => {
    readMovie.mockResolvedValue(extras({ trailer: null }));
    expect(await TrailerSlotContent({ ...MOVIE, title: "X" })).toBeNull();

    readMovie.mockRejectedValue(new TmdbError("timeout", "/movie/550", "x"));
    expect(await TrailerSlotContent({ ...MOVIE, title: "X" })).toBeNull();
  });

  it("reads a show's extras for a show", async () => {
    readTv.mockResolvedValue(extras({ trailer: null }));

    await TrailerSlotContent({ mediaType: "tv", id: 1396, title: "X" });

    expect(readTv).toHaveBeenCalledWith(1396);
    expect(readMovie).not.toHaveBeenCalled();
  });

  it("rethrows anything that is not a TMDB failure", async () => {
    readMovie.mockRejectedValue(new Error("bug"));

    await expect(TrailerSlotContent({ ...MOVIE, title: "X" })).rejects.toThrow(
      "bug",
    );
  });
});

describe("AgeRatingSlotContent (AC-9, AC-13)", () => {
  it("shows the visitor's country rating, naming the country", async () => {
    readMovie.mockResolvedValue(extras());
    region.mockResolvedValue(POLAND);

    render(<>{await AgeRatingSlotContent(MOVIE)}</>);

    expect(screen.getByText("18")).toBeVisible();
    expect(screen.getByText(/Age rating in Poland/)).toBeInTheDocument();
  });

  it("never borrows another country's rating", async () => {
    readMovie.mockResolvedValue(extras({ ageRatings: { US: "R" } }));
    region.mockResolvedValue(POLAND);

    expect(await AgeRatingSlotContent(MOVIE)).toBeNull();
  });

  it("renders nothing when the read failed (AC-18)", async () => {
    readMovie.mockRejectedValue(new TmdbError("not_found", "/movie/550", "x"));
    region.mockResolvedValue(POLAND);

    expect(await AgeRatingSlotContent(MOVIE)).toBeNull();
  });
});

describe("WhereToWatchContent (AC-9, AC-12, AC-18)", () => {
  it("names the country and lists only its non empty groups, in order", async () => {
    readMovie.mockResolvedValue(extras());
    region.mockResolvedValue(POLAND);

    render(await WhereToWatchContent(MOVIE));

    expect(
      screen.getByRole("heading", { name: "Where to watch in Poland" }),
    ).toBeVisible();
    const groups = screen
      .getAllByRole("list")
      .map((list) => list.getAttribute("aria-label"));
    expect(groups).toEqual(["Stream", "Rent or buy"]);
    expect(
      within(screen.getByRole("list", { name: "Stream" })).getByRole("img", {
        name: "Netflix",
      }),
    ).toBeVisible();
    expect(screen.queryByRole("img", { name: "Hulu" })).toBeNull();
    // A provider with no logo shows its name.
    expect(screen.getByText("No Logo")).toBeVisible();
  });

  it("links once to TMDB's page for the country, with the JustWatch credit", async () => {
    readMovie.mockResolvedValue(extras());
    region.mockResolvedValue(POLAND);

    render(await WhereToWatchContent(MOVIE));

    const link = screen.getByRole("link", { name: /All options on TMDB/ });
    expect(link).toHaveAttribute(
      "href",
      "https://www.themoviedb.org/movie/550/watch?locale=PL",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(JUSTWATCH_ATTRIBUTION)).toBeVisible();
  });

  it("says plainly when the country has no providers", async () => {
    readMovie.mockResolvedValue(extras({ watchProviders: {} }));
    region.mockResolvedValue(POLAND);

    render(await WhereToWatchContent(MOVIE));

    expect(
      screen.getByText("Not streaming in Poland right now."),
    ).toBeVisible();
    expect(screen.getByText(JUSTWATCH_ATTRIBUTION)).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("keeps a failure to one line with a Retry to the page (AC-18)", async () => {
    readMovie.mockRejectedValue(new TmdbError("not_found", "/movie/550", "x"));
    region.mockResolvedValue(POLAND);

    render(await WhereToWatchContent(MOVIE));

    expect(
      screen.getByText("Couldn't load where to watch from TMDB."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/movies/550",
    );
  });
});

describe("MoreLikeThisContent (AC-14, AC-18)", () => {
  it("shows up to 12 recommendations, returning to the title page", async () => {
    readMovie.mockResolvedValue(extras());

    render(<>{await MoreLikeThisContent(MOVIE)}</>);

    expect(
      screen.getByRole("heading", { name: "More like this" }),
    ).toBeVisible();
    expect(screen.getByText("Movie 12")).toHaveAttribute(
      "data-return",
      "/movies/550",
    );
    expect(screen.queryByText("Movie 13")).toBeNull();
    expect(screen.queryByRole("link", { name: /See all/ })).toBeNull();
  });

  it("leaves the whole section out with no recommendations", async () => {
    readMovie.mockResolvedValue(
      extras({
        recommendations: {
          mediaType: "movie",
          paged: { page: 1, results: [], totalPages: 0, totalResults: 0 },
        },
      }),
    );

    expect(await MoreLikeThisContent(MOVIE)).toBeNull();
  });

  it("keeps its heading with a one line error and Retry on failure", async () => {
    readTv.mockRejectedValue(new TmdbError("upstream", "/tv/1396", "x"));

    render(<>{await MoreLikeThisContent({ mediaType: "tv", id: 1396 })}</>);

    expect(
      screen.getByRole("heading", { name: "More like this" }),
    ).toBeVisible();
    expect(
      screen.getByText("Couldn't load recommendations from TMDB."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/shows/1396",
    );
  });
});
