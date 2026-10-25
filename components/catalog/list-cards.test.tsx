import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0021, AC-4, AC-5; spec 0028, AC-8
 *
 * A list card is the full grid card: the personal badge, the TV meta line and
 * the controls, each handed the row's ids and the page's return path. The
 * slots are replaced by stubs that print what they were given, so the test
 * pins the wiring a card on a row or a list page relies on, not the slots'
 * own reads (their own tests cover those).
 */
vi.mock("@/components/tracking/show-card-slots", () => ({
  ShowCardBadge: (props: { showId: number; gridShowIds: number[] }) => (
    <span data-testid="badge" data-ids={props.gridShowIds.join(",")}>
      badge {props.showId}
    </span>
  ),
  ShowCardMeta: (props: { showId: number; gridShowIds: number[] }) => (
    <span data-testid="meta" data-ids={props.gridShowIds.join(",")}>
      meta {props.showId}
    </span>
  ),
  ShowCardControls: (props: {
    showId: number;
    name: string;
    gridShowIds: number[];
    returnPath: string;
  }) => (
    <span
      data-testid="controls"
      data-ids={props.gridShowIds.join(",")}
      data-return={props.returnPath}
    >
      controls {props.name}
    </span>
  ),
}));
vi.mock("@/components/tracking/movie-card-slots", () => ({
  MovieCardBadge: (props: {
    movieId: number;
    releaseDate: string | null;
    gridMovieIds: number[];
  }) => (
    <span
      data-testid="badge"
      data-ids={props.gridMovieIds.join(",")}
      data-release={String(props.releaseDate)}
    >
      badge {props.movieId}
    </span>
  ),
  MovieCardControls: (props: {
    movieId: number;
    title: string;
    releaseDate: string | null;
    gridMovieIds: number[];
    returnPath: string;
  }) => (
    <span
      data-testid="controls"
      data-ids={props.gridMovieIds.join(",")}
      data-release={String(props.releaseDate)}
      data-return={props.returnPath}
    >
      controls {props.title}
    </span>
  ),
}));

const { GameListCard, MovieListCard, ShowListCard } = await import(
  "./list-cards"
);
const { ROW_POSTER_SIZES } = await import("./carousel-row-states");
const { POSTER_SIZES } = await import("@/components/poster-card");

const SHOW = {
  id: 1396,
  name: "Breaking Bad",
  posterUrl: "https://image.tmdb.org/t/p/w500/bb.jpg",
  tmdbRating: 8.9,
} as Parameters<typeof ShowListCard>[0]["show"];

const MOVIE = {
  id: 550,
  title: "Fight Club",
  posterUrl: null,
  releaseDate: "2027-03-01",
  tmdbRating: 8.4,
} as Parameters<typeof MovieListCard>[0]["movie"];

const GAME = {
  id: 1942,
  name: "The Witcher 3",
  coverUrl: null,
  communityRating: 9.3,
  releaseDate: "2026-11-06",
} as Parameters<typeof GameListCard>[0]["game"];

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ShowListCard (AC-4)", () => {
  it("links the card to the show page", () => {
    render(
      <ShowListCard
        show={SHOW}
        gridShowIds={[1396, 2]}
        returnPath="/shows"
        priority={false}
      />,
    );

    expect(screen.getByRole("link", { name: "Breaking Bad" })).toHaveAttribute(
      "href",
      "/shows/1396",
    );
  });

  it("gives the badge, meta and controls the whole row's ids", () => {
    render(
      <ShowListCard
        show={SHOW}
        gridShowIds={[1396, 2, 3]}
        returnPath="/shows"
        priority={false}
      />,
    );

    for (const slot of ["badge", "meta", "controls"]) {
      expect(screen.getByTestId(slot)).toHaveAttribute("data-ids", "1396,2,3");
    }
  });

  it("sends the controls the return path it was given", () => {
    render(
      <ShowListCard
        show={SHOW}
        gridShowIds={[1396]}
        returnPath="/shows/top-rated?page=3"
        priority={false}
      />,
    );

    expect(screen.getByTestId("controls")).toHaveAttribute(
      "data-return",
      "/shows/top-rated?page=3",
    );
  });

  it("uses the row's poster sizes when given, and the grid's otherwise (AC-5)", () => {
    const { container, rerender } = render(
      <ShowListCard
        show={SHOW}
        gridShowIds={[1396]}
        returnPath="/shows"
        priority={false}
        sizes={ROW_POSTER_SIZES}
      />,
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "sizes",
      "(min-width: 768px) 180px, 140px",
    );

    rerender(
      <ShowListCard
        show={SHOW}
        gridShowIds={[1396]}
        returnPath="/shows"
        priority={false}
      />,
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "sizes",
      POSTER_SIZES,
    );
  });
});

describe("MovieListCard (AC-4)", () => {
  it("links the card to the movie page", () => {
    render(
      <MovieListCard
        movie={MOVIE}
        gridMovieIds={[550]}
        returnPath="/movies"
        priority={false}
      />,
    );

    expect(screen.getByRole("link", { name: "Fight Club" })).toHaveAttribute(
      "href",
      "/movies/550",
    );
  });

  it("passes the release date to the badge and controls, for the release gate", () => {
    render(
      <MovieListCard
        movie={MOVIE}
        gridMovieIds={[550, 13]}
        returnPath="/movies/upcoming"
        priority={false}
      />,
    );

    expect(screen.getByTestId("badge")).toHaveAttribute(
      "data-release",
      "2027-03-01",
    );
    expect(screen.getByTestId("controls")).toHaveAttribute(
      "data-release",
      "2027-03-01",
    );
    expect(screen.getByTestId("controls")).toHaveAttribute(
      "data-ids",
      "550,13",
    );
    expect(screen.getByTestId("controls")).toHaveAttribute(
      "data-return",
      "/movies/upcoming",
    );
  });

  it("shows the fallback tile when the movie has no poster", () => {
    const { container } = render(
      <MovieListCard
        movie={MOVIE}
        gridMovieIds={[550]}
        returnPath="/movies"
        priority={false}
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(
      container.querySelector('[data-slot="poster-fallback"]'),
    ).toBeInTheDocument();
  });

  it("has no meta line, unlike a show card", () => {
    render(
      <MovieListCard
        movie={MOVIE}
        gridMovieIds={[550]}
        returnPath="/movies"
        priority={false}
      />,
    );

    expect(screen.queryByTestId("meta")).not.toBeInTheDocument();
  });
});

describe("GameListCard (spec 0028, AC-8)", () => {
  it("links the card to the game page with IGDB's rating", () => {
    render(<GameListCard game={GAME} priority={false} />);

    expect(screen.getByRole("link", { name: "The Witcher 3" })).toHaveAttribute(
      "href",
      "/games/1942",
    );
    expect(screen.getByText("9.3")).toBeInTheDocument();
  });

  it("prints no date unless the list dates its cards", () => {
    render(<GameListCard game={GAME} priority={false} />);

    expect(
      document.querySelector('[data-slot="release-date"]'),
    ).not.toBeInTheDocument();
  });

  it("prints the release day, with the year only outside this one", () => {
    const { unmount } = render(
      <GameListCard game={GAME} priority={false} releaseDay="2026-10-25" />,
    );
    expect(
      document.querySelector('[data-slot="release-date"]'),
    ).toHaveTextContent("Nov 6");
    unmount();

    render(
      <GameListCard
        game={{ ...GAME, releaseDate: "2027-01-08" }}
        priority={false}
        releaseDay="2026-10-25"
      />,
    );
    expect(
      document.querySelector('[data-slot="release-date"]'),
    ).toHaveTextContent("Jan 8, 2027");
  });
});
