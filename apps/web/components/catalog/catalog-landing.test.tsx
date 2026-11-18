import { render, screen } from "@testing-library/react";
import type * as React from "react";
import { describe, expect, it, vi } from "vitest";

import type { CatalogList } from "@/lib/catalog/lists";

/**
 * covers: prompts/home-parallax-landing.md, AC-1
 *
 * The two landings through their real route files: a hidden h1, then the
 * hero and the five sections in order, each given its slot's list. The
 * sections are replaced by stubs that print what they were given; their own
 * bodies are covered in `landing/landing-sections.test.tsx` and
 * `landing/landing-hero.test.tsx`.
 */
function stub(name: string) {
  return ({ list, label }: { list: CatalogList; label?: string }) => (
    <section
      aria-label={name}
      data-list={`${list.mediaType}/${list.slug}`}
      data-label={label}
    />
  );
}

vi.mock("@/components/catalog/landing/landing-parallax", () => ({
  LandingParallax: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/components/catalog/landing/landing-hero", () => ({
  LandingHero: stub("hero"),
}));
vi.mock("@/components/catalog/landing/trending-pin", () => ({
  TrendingPin: stub("trending"),
}));
vi.mock("@/components/catalog/landing/popular-grid", () => ({
  PopularGrid: stub("popular"),
}));
vi.mock("@/components/catalog/landing/now-playing-columns", () => ({
  NowPlayingColumns: stub("now"),
}));
vi.mock("@/components/catalog/landing/upcoming-rows", () => ({
  UpcomingRows: stub("upcoming"),
}));
vi.mock("@/components/catalog/landing/top-rated-list", () => ({
  TopRatedList: stub("top"),
}));

const { default: ShowsPage } = await import("@/app/shows/page");
const { default: MoviesPage } = await import("@/app/movies/page");

function sections() {
  return screen
    .getAllByRole("region")
    .map(
      (section) =>
        `${section.getAttribute("aria-label")}:${section.getAttribute("data-list")}`,
    );
}

describe("the movie landing (AC-1)", () => {
  it("has the h1 Movies for assistive technology only", () => {
    render(<MoviesPage />);

    const heading = screen.getByRole("heading", { level: 1, name: "Movies" });
    expect(heading).toHaveClass("sr-only");
  });

  it("renders the hero and the five sections in order", () => {
    render(<MoviesPage />);

    expect(sections()).toEqual([
      "hero:movie/trending",
      "trending:movie/trending",
      "popular:movie/popular",
      "now:movie/now-playing",
      "upcoming:movie/upcoming",
      "top:movie/top-rated",
    ]);
    expect(screen.getByRole("region", { name: "now" })).toHaveAttribute(
      "data-label",
      "In cinemas",
    );
  });
});

describe("the TV landing (AC-1)", () => {
  it("has the h1 Shows for assistive technology only", () => {
    render(<ShowsPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Shows" }),
    ).toHaveClass("sr-only");
  });

  it("puts Airing today and On the air in the middle slots", () => {
    render(<ShowsPage />);

    expect(sections()).toEqual([
      "hero:tv/trending",
      "trending:tv/trending",
      "popular:tv/popular",
      "now:tv/airing-today",
      "upcoming:tv/on-the-air",
      "top:tv/top-rated",
    ]);
    expect(screen.getByRole("region", { name: "now" })).toHaveAttribute(
      "data-label",
      "On TV today",
    );
  });
});
