import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0021, AC-3, AC-7, AC-11, AC-12
 *
 * A row's cards on their own: the first 12 titles, the first `eagerCount`
 * posters eager, a `TmdbError` kept inside the row with a Try again to the
 * landing, an empty list said in one line, and any other error rethrown. The
 * read and the cards are replaced; `TmdbError` is the real one.
 */
const read = vi.fn();

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/tmdb", async () => ({
  TmdbError: (await import("@/lib/tmdb/errors")).TmdbError,
}));
vi.mock("@/lib/catalog-list-read", () => ({
  readTaggedCatalogList: (...args: unknown[]) => read(...args),
}));
vi.mock("@/components/catalog/list-cards", () => ({
  ShowListCard: ({
    show,
    priority,
    returnPath,
    sizes,
  }: {
    show: { name: string };
    priority: boolean;
    returnPath: string;
    sizes: string;
  }) => (
    <span
      data-priority={String(priority)}
      data-return={returnPath}
      data-sizes={sizes}
    >
      {show.name}
    </span>
  ),
  MovieListCard: ({ movie }: { movie: { title: string } }) => (
    <span>{movie.title}</span>
  ),
}));

const { TmdbError } = await import("@/lib/tmdb/errors");
const { catalogList } = await import("@/lib/catalog/lists");
const { CarouselRowItems } = await import("./carousel-row");

const TOP_RATED = catalogList("tv", "top-rated");

function shows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Show ${index + 1}`,
  }));
}

afterEach(() => read.mockReset());

describe("CarouselRowItems", () => {
  it("reads page 1 and shows the first 12 titles (AC-3)", async () => {
    read.mockResolvedValue({
      mediaType: "tv",
      paged: { results: shows(20), totalPages: 5, page: 1, totalResults: 99 },
    });

    render(await CarouselRowItems({ list: TOP_RATED, eagerCount: 6 }));

    expect(read).toHaveBeenCalledWith(TOP_RATED, 1);
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(12);
    expect(screen.getByText("Show 12")).toBeInTheDocument();
    expect(screen.queryByText("Show 13")).not.toBeInTheDocument();
  });

  it("loads the first eagerCount posters eagerly, at the row's sizes (AC-5, AC-7)", async () => {
    read.mockResolvedValue({
      mediaType: "tv",
      paged: { results: shows(8), totalPages: 1, page: 1, totalResults: 8 },
    });

    render(await CarouselRowItems({ list: TOP_RATED, eagerCount: 6 }));

    expect(screen.getByText("Show 6")).toHaveAttribute("data-priority", "true");
    expect(screen.getByText("Show 7")).toHaveAttribute(
      "data-priority",
      "false",
    );
    expect(screen.getByText("Show 1")).toHaveAttribute(
      "data-sizes",
      "(min-width: 768px) 180px, 140px",
    );
    expect(screen.getByText("Show 1")).toHaveAttribute("data-return", "/shows");
  });

  it("keeps a TMDB failure inside the row, with Try again to the landing (AC-11)", async () => {
    read.mockRejectedValue(
      new TmdbError("upstream", "/tv/top_rated", "503", 503),
    );

    render(await CarouselRowItems({ list: TOP_RATED, eagerCount: 0 }));

    expect(screen.getByText("Couldn't load Top rated")).toBeInTheDocument();
    expect(screen.getByText("TMDB didn't respond.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/shows",
    );
  });

  it("says so in one line when the list is empty (AC-12)", async () => {
    read.mockResolvedValue({
      mediaType: "tv",
      paged: { results: [], totalPages: 0, page: 1, totalResults: 0 },
    });

    render(await CarouselRowItems({ list: TOP_RATED, eagerCount: 0 }));

    expect(screen.getByText("Nothing here right now.")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("rethrows anything that is not a TMDB failure", async () => {
    read.mockRejectedValue(new TypeError("a bug"));

    await expect(
      CarouselRowItems({ list: TOP_RATED, eagerCount: 0 }),
    ).rejects.toThrow("a bug");
  });
});
