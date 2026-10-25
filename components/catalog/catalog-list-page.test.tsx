import { render, screen, within } from "@testing-library/react";
import type * as React from "react";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CatalogList } from "@/lib/catalog/lists";

/**
 * covers: spec 0021, AC-4, AC-7, AC-9, AC-10
 *
 * A list's See all page. The header (back link, h1, note) is the static part,
 * outside the grid's Suspense boundary. The grid is the async part: it is
 * awaited here as a function, the way the boundary would resolve it, because
 * jsdom's client renderer does not reliably commit an async Server Component
 * (see the sign up page test). The read and the cards are replaced;
 * `TmdbError` is the real one.
 */
const read = vi.fn();

vi.mock("@/lib/igdb", async () => ({
  IgdbError: (await import("@/lib/igdb/errors")).IgdbError,
  getGameGenres: async () => [],
}));
vi.mock("@/lib/tmdb", async () => ({
  TmdbError: (await import("@/lib/tmdb/errors")).TmdbError,
}));
vi.mock("@/lib/tracking/episode-state", () => ({
  requestTodayUtc: () => "2026-10-18",
}));
vi.mock("@/lib/catalog-list-read", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/catalog-list-read")>()),
  readTaggedCatalogGridPage: (...args: unknown[]) => read(...args),
}));
vi.mock("@/components/catalog/list-cards", () => ({
  ShowListCard: (props: {
    show: { name: string };
    gridShowIds: number[];
    priority: boolean;
    returnPath: string;
  }) => (
    <span
      data-priority={String(props.priority)}
      data-return={props.returnPath}
      data-ids={props.gridShowIds.join(",")}
    >
      {props.show.name}
    </span>
  ),
  GameListCard: (props: { game: { name: string }; priority: boolean }) => (
    <span data-priority={String(props.priority)}>{props.game.name}</span>
  ),
  MovieListCard: (props: {
    movie: { title: string };
    priority: boolean;
    returnPath: string;
  }) => (
    <span data-priority={String(props.priority)} data-return={props.returnPath}>
      {props.movie.title}
    </span>
  ),
}));

const { TmdbError } = await import("@/lib/tmdb/errors");
const { IgdbError, IgdbValidationError } = await import("@/lib/igdb/errors");
const { catalogList } = await import("@/lib/catalog/lists");
const { CatalogListPage } = await import("./catalog-list-page");

type Element = React.ReactElement<Record<string, unknown>>;

const TOP_RATED: CatalogList = catalogList("tv", "top-rated");
const NOW_PLAYING = catalogList("movie", "now-playing");

function pageTree(
  list = TOP_RATED,
  params: Record<string, string | string[]> = {},
): Element[] {
  const page = CatalogListPage({
    list,
    searchParams: Promise.resolve(params),
  }) as Element;
  return page.props.children as Element[];
}

function gridBoundary(
  list = TOP_RATED,
  params: Record<string, string | string[]> = {},
): Element {
  const boundary = pageTree(list, params).find(
    (child) => child?.type === Suspense,
  );
  if (!boundary) throw new Error("the list page has no grid boundary");
  return boundary;
}

/** Resolves the grid the way its Suspense boundary would. */
async function renderGrid(
  list = TOP_RATED,
  params: Record<string, string | string[]> = {},
) {
  const slot = gridBoundary(list, params).props.children as Element;
  const resolve = slot.type as (props: unknown) => Promise<React.ReactElement>;
  return render(await resolve(slot.props));
}

function shows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Show ${index + 1}`,
  }));
}

function tvPage(count: number, totalPages: number) {
  return {
    mediaType: "tv",
    paged: {
      page: 1,
      results: shows(count),
      totalPages,
      totalResults: totalPages * 20,
    },
  };
}

afterEach(() => read.mockReset());

describe("the list page header (AC-9)", () => {
  it("links back to the landing above the h1 and the note", () => {
    const header = pageTree().find((child) => child?.type === "header");
    if (!header) throw new Error("the list page has no header");

    render(header);

    expect(screen.getByRole("link", { name: "Shows" })).toHaveAttribute(
      "href",
      "/shows",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Top rated shows" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ordered by TMDB community rating."),
    ).toBeInTheDocument();
  });

  it("links a movie list back to Movies", () => {
    const header = pageTree(NOW_PLAYING).find(
      (child) => child?.type === "header",
    );
    if (!header) throw new Error("the list page has no header");

    render(header);

    expect(screen.getByRole("link", { name: "Movies" })).toHaveAttribute(
      "href",
      "/movies",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Movies now playing" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("In Polish cinemas now, per TMDB."),
    ).toBeInTheDocument();
  });

  it("keeps the header outside the grid's Suspense boundary (AC-7)", () => {
    const children = pageTree();
    const header = children.findIndex((child) => child?.type === "header");
    const boundary = children.findIndex((child) => child?.type === Suspense);

    expect(header).toBeGreaterThanOrEqual(0);
    expect(boundary).toBeGreaterThan(header);
  });
});

describe("the list page grid (AC-4, AC-9)", () => {
  it("reads the page from the URL and shows one card per title", async () => {
    read.mockResolvedValue(tvPage(24, 30));

    await renderGrid(TOP_RATED, { page: "2" });

    expect(read).toHaveBeenCalledWith(TOP_RATED, 2);
    const grid = screen.getByRole("list", { name: "Top rated shows, page 2" });
    expect(within(grid).getAllByRole("listitem")).toHaveLength(24);
  });

  it("reads page 1 when the URL has no page", async () => {
    read.mockResolvedValue(tvPage(24, 30));

    await renderGrid();

    expect(read).toHaveBeenCalledWith(TOP_RATED, 1);
  });

  it("gives every card the whole page's ids and the page URL to return to", async () => {
    read.mockResolvedValue(tvPage(3, 30));

    await renderGrid(TOP_RATED, { page: "4" });

    const card = screen.getByText("Show 2");
    expect(card).toHaveAttribute("data-ids", "1,2,3");
    expect(card).toHaveAttribute("data-return", "/shows/top-rated?page=4");
  });

  it("returns to the bare list path from page 1", async () => {
    read.mockResolvedValue(tvPage(3, 30));

    await renderGrid();

    expect(screen.getByText("Show 1")).toHaveAttribute(
      "data-return",
      "/shows/top-rated",
    );
  });

  it("loads the first 6 posters eagerly and the rest lazily (AC-7; spec 0022, AC-5)", async () => {
    read.mockResolvedValue(tvPage(8, 30));

    await renderGrid();

    expect(screen.getByText("Show 6")).toHaveAttribute("data-priority", "true");
    expect(screen.getByText("Show 7")).toHaveAttribute(
      "data-priority",
      "false",
    );
  });

  it("renders movie cards for a movie list", async () => {
    read.mockResolvedValue({
      mediaType: "movie",
      paged: {
        page: 1,
        results: [{ id: 550, title: "Fight Club" }],
        totalPages: 1,
        totalResults: 1,
      },
    });

    await renderGrid(NOW_PLAYING);

    expect(screen.getByText("Fight Club")).toHaveAttribute(
      "data-return",
      "/movies/now-playing",
    );
  });

  it("pages with Page N of M, page 1 as the bare path", async () => {
    read.mockResolvedValue(tvPage(24, 30));

    await renderGrid(TOP_RATED, { page: "2" });

    const nav = screen.getByRole("navigation", { name: "Pagination" });
    expect(within(nav).getByText("Page 2 of 30")).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/shows/top-rated",
    );
    expect(within(nav).getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/shows/top-rated?page=3",
    );
  });

  it("ends at the grid's own last page under TMDB's cap", async () => {
    read.mockResolvedValue(tvPage(16, 417));

    await renderGrid(TOP_RATED, { page: "417" });

    expect(screen.getByText("Page 417 of 417")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Next" }),
    ).not.toBeInTheDocument();
  });
});

describe("the list page states (AC-10)", () => {
  it.each([["abc"], ["0"], ["-1"], ["1.5"], ["501"]])(
    "says page %s doesn't exist without reading TMDB",
    async (page) => {
      await renderGrid(TOP_RATED, { page });

      expect(read).not.toHaveBeenCalled();
      expect(screen.getByText("That page doesn't exist")).toBeInTheDocument();
      expect(
        screen.getByText("There are no top rated shows at this page number."),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Back to page 1" }),
      ).toHaveAttribute("href", "/shows/top-rated");
    },
  );

  it("says a repeated page parameter doesn't exist", async () => {
    await renderGrid(TOP_RATED, { page: ["1", "2"] });

    expect(read).not.toHaveBeenCalled();
    expect(screen.getByText("That page doesn't exist")).toBeInTheDocument();
  });

  it("says a page past the last one doesn't exist, using the list's noun", async () => {
    read.mockResolvedValue({
      mediaType: "movie",
      paged: { page: 9, results: [], totalPages: 3, totalResults: 60 },
    });

    await renderGrid(NOW_PLAYING, { page: "9" });

    expect(screen.getByText("That page doesn't exist")).toBeInTheDocument();
    expect(
      screen.getByText("There are no movies now playing at this page number."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to page 1" }),
    ).toHaveAttribute("href", "/movies/now-playing");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("shows the TMDB error with Try again to the current page", async () => {
    read.mockRejectedValue(
      new TmdbError("upstream", "/tv/top_rated", "503", 503),
    );

    await renderGrid(TOP_RATED, { page: "3" });

    expect(screen.getByText("Couldn't reach TMDB")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/shows/top-rated?page=3",
    );
  });

  it("rethrows a failure that is not a TMDB error", async () => {
    read.mockRejectedValue(new TypeError("a bug"));
    const slot = gridBoundary().props.children as Element;
    const resolve = slot.type as (props: unknown) => Promise<unknown>;

    await expect(resolve(slot.props)).rejects.toThrow("a bug");
  });

  it("says the list is empty when page 1 has no titles", async () => {
    read.mockResolvedValue(tvPage(0, 0));

    await renderGrid();

    expect(
      screen.getByText("TMDB lists nothing here right now."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("That page doesn't exist"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("holds the grid's place with 24 card skeletons and the pagination skeleton", () => {
    const fallback = gridBoundary().props.fallback as Element;

    const { container } = render(fallback);

    const grid = container.querySelector('[aria-hidden="true"]');
    expect(grid?.querySelectorAll("li")).toHaveLength(24);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});

/** covers: spec 0028, AC-9 to AC-11 */
describe("a games list page", () => {
  const COMING_SOON = catalogList("game", "coming-soon");

  function games(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      name: `Game ${index + 1}`,
    }));
  }

  function gamePage(
    count: number,
    totalResults: number | null,
    hasNextPage = false,
  ) {
    return {
      mediaType: "game",
      paged: { page: 1, results: games(count), hasNextPage, totalResults },
    };
  }

  it("links back to Games above its h1 and note", () => {
    const header = pageTree(COMING_SOON).find(
      (child) => child?.type === "header",
    );
    if (!header) throw new Error("the list page has no header");
    render(header);

    expect(screen.getByRole("link", { name: "Games" })).toHaveAttribute(
      "href",
      "/games",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Games coming soon" }),
    ).toBeInTheDocument();
  });

  it("counts pages from IGDB's count, 24 a page", async () => {
    read.mockResolvedValue(gamePage(24, 50));
    await renderGrid(COMING_SOON);

    expect(screen.getAllByRole("listitem")).toHaveLength(24);
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Next/ })).toHaveAttribute(
      "href",
      "/games/coming-soon?page=2",
    );
  });

  it("caps the count at IGDB's 50 pages", async () => {
    read.mockResolvedValue(gamePage(24, 5000));
    await renderGrid(COMING_SOON);

    expect(screen.getByText("Page 1 of 50")).toBeInTheDocument();
  });

  it("says only Page N with no count, and offers Next while IGDB has more", async () => {
    read.mockResolvedValue(gamePage(24, null, true));
    await renderGrid(COMING_SOON);

    expect(screen.getByText("Page 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Next/ })).toBeInTheDocument();
  });

  it("shows no such page past the last page", async () => {
    read.mockResolvedValue(gamePage(0, 30));
    await renderGrid(COMING_SOON, { page: "3" });

    expect(
      screen.getByText("There are no upcoming games at this page number."),
    ).toBeInTheDocument();
  });

  it("shows the empty panel for an empty page 1", async () => {
    read.mockResolvedValue(gamePage(0, 0));
    await renderGrid(COMING_SOON);

    expect(
      screen.getByText("IGDB lists no upcoming games right now."),
    ).toBeInTheDocument();
  });

  it("answers an IGDB failure with its retry panel", async () => {
    read.mockRejectedValue(new IgdbError("timeout", "games", "slow"));
    await renderGrid(COMING_SOON, { page: "2" });

    expect(screen.getByText("Couldn't reach IGDB")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Try again/ })).toHaveAttribute(
      "href",
      "/games/coming-soon?page=2",
    );
  });

  it("rethrows a validation error, which is a bug", async () => {
    read.mockRejectedValue(new IgdbValidationError("page", "bad"));
    await expect(renderGrid(COMING_SOON)).rejects.toBeInstanceOf(
      IgdbValidationError,
    );
  });
});
