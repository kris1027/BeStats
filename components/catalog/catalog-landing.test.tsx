import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CatalogList } from "@/lib/catalog/lists";

/**
 * covers: spec 0021, AC-1, AC-7
 *
 * The two landings through their real route files: the h1, then one row per
 * list in AC-1 order, with only the first row's posters eager. The row is
 * replaced by a stub that prints what it was given; its own header and cards
 * are covered in `carousel-row.test.tsx`.
 */
vi.mock("@/components/catalog/carousel-row", () => ({
  CarouselRow: ({
    list,
    eagerCount,
  }: {
    list: CatalogList;
    eagerCount: number;
  }) => (
    <section aria-label={list.rowTitle} data-eager={String(eagerCount)}>
      {list.slug}
    </section>
  ),
}));

const { default: ShowsPage } = await import("@/app/shows/page");
const { default: MoviesPage } = await import("@/app/movies/page");

function rowTitles() {
  return screen
    .getAllByRole("region")
    .map((row) => row.getAttribute("aria-label"));
}

describe("the TV landing (AC-1)", () => {
  it("shows the h1 Shows", () => {
    render(<ShowsPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Shows" }),
    ).toBeInTheDocument();
  });

  it("shows the five TV rows in order", () => {
    render(<ShowsPage />);

    expect(rowTitles()).toEqual([
      "Trending this week",
      "Popular",
      "Airing today",
      "On the air",
      "Top rated",
    ]);
  });

  it("loads 6 posters eagerly on the first row only (AC-7)", () => {
    render(<ShowsPage />);

    const eager = screen
      .getAllByRole("region")
      .map((row) => row.getAttribute("data-eager"));
    expect(eager).toEqual(["6", "0", "0", "0", "0"]);
  });
});

describe("the movie landing (AC-1)", () => {
  it("shows the h1 Movies", () => {
    render(<MoviesPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Movies" }),
    ).toBeInTheDocument();
  });

  it("shows the five movie rows in order", () => {
    render(<MoviesPage />);

    expect(rowTitles()).toEqual([
      "Trending this week",
      "Popular",
      "Now playing",
      "Upcoming",
      "Top rated",
    ]);
  });

  it("loads 6 posters eagerly on the first row only (AC-7)", () => {
    render(<MoviesPage />);

    const eager = screen
      .getAllByRole("region")
      .map((row) => row.getAttribute("data-eager"));
    expect(eager).toEqual(["6", "0", "0", "0", "0"]);
  });

  it("has no subtitle under the h1", () => {
    const { container } = render(<MoviesPage />);

    expect(container.querySelector("p")).toBeNull();
  });
});
