import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: prompts/home-parallax-landing.md, AC-3, AC-5, AC-6 (decision 4);
 * prompts/home-hero-backdrop-quality.md, AC-2 and AC-7
 *
 * The hero's body: trending number one over its backdrop, its TMDB rating,
 * up to three genre names, the Trailer and tracking slots for its media
 * type, and what happens when a read fails. The reads and the slots are
 * replaced; `TmdbError` is the real one.
 */
const read = vi.fn();
const movieGenres = vi.fn();
const tvGenres = vi.fn();
const gameGenres = vi.fn();

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/igdb", async () => ({
  IgdbError: (await import("@/lib/igdb/errors")).IgdbError,
  getGameGenres: () => gameGenres(),
}));
vi.mock("@/lib/tmdb", async () => ({
  TmdbError: (await import("@/lib/tmdb/errors")).TmdbError,
  getMovieGenres: () => movieGenres(),
  getTvGenres: () => tvGenres(),
  resizeImageUrl: (await import("@/lib/tmdb/images")).resizeImageUrl,
}));
vi.mock("@/lib/catalog-list-read", () => ({
  readTaggedCatalogList: (...args: unknown[]) => read(...args),
}));
vi.mock("@/components/catalog/title-extras", () => ({
  TrailerSlot: ({ mediaType, id }: { mediaType: string; id: number }) => (
    <span data-testid="trailer">{`${mediaType}/${id}`}</span>
  ),
}));
vi.mock("@/components/tracking/movie-card-slots", () => ({
  MovieCardBadge: () => null,
  MovieCardControls: () => null,
}));
vi.mock("@/components/tracking/show-card-slots", () => ({
  ShowCardBadge: () => null,
  ShowCardControls: () => null,
}));
vi.mock("@/components/tracking/movie-tracking-slot", () => ({
  MovieTrackingSlot: ({ movieId }: { movieId: number }) => (
    <span data-testid="tracking">{`movie/${movieId}`}</span>
  ),
}));
vi.mock("@/components/tracking/game-tracking-slot", () => ({
  GameTrackingSlot: ({ gameId }: { gameId: number }) => (
    <span data-testid="tracking">{`game/${gameId}`}</span>
  ),
}));
vi.mock("@/components/tracking/show-tracking-slot", () => ({
  ShowTrackingSlot: ({ showId }: { showId: number }) => (
    <span data-testid="tracking">{`tv/${showId}`}</span>
  ),
}));

const { TmdbError } = await import("@/lib/tmdb/errors");
const { IgdbError } = await import("@/lib/igdb/errors");
const { landingSlots } = await import("@/lib/catalog/landing");
const { LandingHeroContent } = await import("./landing-hero");

const MOVIE = {
  id: 7,
  title: "Spider-Man: Brand New Day",
  posterUrl: "https://image.tmdb.org/t/p/w500/p.jpg",
  backdropUrl: "https://image.tmdb.org/t/p/w1280/b.jpg",
  releaseDate: "2026-07-31",
  releaseYear: 2026,
  tmdbRating: 8.5,
  genreIds: [28, 12, 878, 35],
};

const GENRES = [
  { id: 12, name: "Adventure" },
  { id: 28, name: "Action" },
  { id: 35, name: "Comedy" },
  { id: 878, name: "Science Fiction" },
];

function page(mediaType: "movie" | "tv", results: unknown[]) {
  return {
    mediaType,
    paged: { results, page: 1, totalPages: 1, totalResults: results.length },
  };
}

afterEach(() => {
  read.mockReset();
  movieGenres.mockReset();
  tvGenres.mockReset();
  gameGenres.mockReset();
});

describe("LandingHeroContent (AC-3)", () => {
  it("features trending number one with its rating, genres and slots", async () => {
    read.mockResolvedValue(page("movie", [MOVIE, { ...MOVIE, id: 8 }]));
    movieGenres.mockResolvedValue(GENRES);

    const { container } = render(
      await LandingHeroContent({ list: landingSlots("movie").trending }),
    );

    expect(
      screen.getByRole("heading", { level: 2, name: MOVIE.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: MOVIE.title })).toHaveAttribute(
      "href",
      "/movies/7",
    );
    expect(screen.getByText("#1 Trending")).toBeInTheDocument();
    expect(screen.getByText("TMDB rating")).toBeInTheDocument();
    expect(screen.getByText("8.5")).toBeInTheDocument();
    // TMDB's genre order, at most three.
    expect(
      screen.getByText("Action, Adventure, Science Fiction"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("trailer")).toHaveTextContent("movie/7");
    expect(screen.getByTestId("tracking")).toHaveTextContent("movie/7");
    // The hero alone asks for TMDB's original (prompts/home-hero-backdrop-quality.md, AC-2).
    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      encodeURIComponent("/t/p/original/b.jpg"),
    );
  });

  it("uses the show slots on the TV landing", async () => {
    read.mockResolvedValue(
      page("tv", [
        {
          ...MOVIE,
          name: "Severance",
          firstAirDate: null,
          firstAirYear: null,
        },
      ]),
    );
    tvGenres.mockResolvedValue([]);

    render(await LandingHeroContent({ list: landingSlots("tv").trending }));

    expect(screen.getByRole("link", { name: "Severance" })).toHaveAttribute(
      "href",
      "/shows/7",
    );
    expect(screen.getByTestId("tracking")).toHaveTextContent("tv/7");
  });

  it("falls back to the poster when there is no backdrop (AC-5)", async () => {
    read.mockResolvedValue(page("movie", [{ ...MOVIE, backdropUrl: null }]));
    movieGenres.mockResolvedValue(GENRES);

    const { container } = render(
      await LandingHeroContent({ list: landingSlots("movie").trending }),
    );

    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      "p.jpg",
    );
  });

  it("leaves the genres out when their read fails", async () => {
    read.mockResolvedValue(page("movie", [MOVIE]));
    movieGenres.mockRejectedValue(new TmdbError("upstream", "/g", "503", 503));

    render(await LandingHeroContent({ list: landingSlots("movie").trending }));

    expect(screen.queryByText(/Action/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: MOVIE.title }),
    ).toBeInTheDocument();
  });
});

describe("LandingHeroContent's failure states (AC-6)", () => {
  it("renders nothing when trending fails, leaving the error to the Trending row", async () => {
    read.mockRejectedValue(new TmdbError("upstream", "/x", "503", 503));

    expect(
      await LandingHeroContent({ list: landingSlots("movie").trending }),
    ).toBeNull();
  });

  it("renders nothing when trending is empty", async () => {
    read.mockResolvedValue(page("movie", []));

    expect(
      await LandingHeroContent({ list: landingSlots("movie").trending }),
    ).toBeNull();
  });
});

/** covers: spec 0028, AC-7 */
describe("the games hero", () => {
  const GAME = {
    id: 1942,
    name: "The Witcher 3: Wild Hunt",
    coverUrl:
      "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1.jpg",
    artUrl: "https://images.igdb.com/igdb/image/upload/t_1080p/ar1.jpg",
    releaseDate: "2015-05-19",
    releaseYear: 2015,
    communityRating: 9.3,
    communityRatingCount: 4000,
    genreIds: [12, 31],
    platformIds: [],
    hidden: false,
  };

  function gamePage(results: unknown[]) {
    return {
      mediaType: "game",
      paged: { results, page: 1, hasNextPage: false, totalResults: 1 },
    };
  }

  it("features the game over its art, with IGDB's rating, genres and the status control", async () => {
    read.mockResolvedValue(gamePage([GAME]));
    gameGenres.mockResolvedValue([
      { id: 12, name: "Role-playing (RPG)" },
      { id: 31, name: "Adventure" },
    ]);

    const { container } = render(
      await LandingHeroContent({ list: landingSlots("game").trending }),
    );

    expect(screen.getByRole("link", { name: GAME.name })).toHaveAttribute(
      "href",
      "/games/1942",
    );
    expect(screen.getByText("IGDB community rating")).toBeInTheDocument();
    expect(screen.getByText("9.3")).toBeInTheDocument();
    expect(
      screen.getByText("Role-playing (RPG), Adventure"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("trailer")).not.toBeInTheDocument();
    expect(screen.getByTestId("tracking")).toHaveTextContent("game/1942");
    expect(
      decodeURIComponent(
        container.querySelector("img")?.getAttribute("src") ?? "",
      ),
    ).toContain("t_1080p/ar1.jpg");
  });

  it("falls back to the cover, and leaves genres out when IGDB fails them", async () => {
    read.mockResolvedValue(gamePage([{ ...GAME, artUrl: null }]));
    gameGenres.mockRejectedValue(new IgdbError("upstream", "genres", "503"));

    const { container } = render(
      await LandingHeroContent({ list: landingSlots("game").trending }),
    );

    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      "co1.jpg",
    );
    expect(screen.queryByText(/Adventure/)).not.toBeInTheDocument();
  });
});
