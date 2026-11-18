import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Movie, TvShow } from "@/lib/tmdb";

import {
  AgeRatingChip,
  MovieCrew,
  MovieFacts,
  ShowCrew,
  ShowFacts,
} from "./title-details";

/**
 * covers: spec 0022, AC-13, AC-15, AC-16
 *
 * The crew lines, the age chip and the Facts panel: each value only when
 * TMDB has one, never Unknown or 0, and the panel gone when nothing is left.
 */

const MOVIE = {
  title: "Fight Club",
  originalTitle: "Fight Club",
  originalLanguage: "en",
  status: "Released",
  budget: 63_000_000,
  revenue: 100_853_753,
  productionCompanies: [
    { id: 1, name: "Fox 2000 Pictures", logoUrl: null },
    { id: 2, name: "Regency Enterprises", logoUrl: null },
  ],
  directors: ["David Fincher"],
  writers: ["Jim Uhls"],
} as Movie;

const SHOW = {
  status: "Ended",
  type: "Scripted",
  originalLanguage: "en",
  networks: [
    { id: 174, name: "AMC", logoUrl: "https://image.tmdb.org/t/p/w154/a.png" },
    { id: 2, name: "No Logo TV", logoUrl: null },
  ],
  productionCompanies: [],
  firstAirDate: "2008-01-20",
  lastAirDate: "2013-09-29",
  createdBy: ["Vince Gilligan"],
} as unknown as TvShow;

/** The panel's facts as `label: value` pairs, in order. */
function facts(): string[] {
  return Array.from(document.querySelectorAll("dl > div")).map(
    (row) =>
      `${row.querySelector("dt")?.textContent}: ${row.querySelector("dd")?.textContent}`,
  );
}

describe("crew lines (AC-15)", () => {
  it("shows Directed by and Written by for a movie", () => {
    render(<MovieCrew movie={{ directors: ["A", "B"], writers: ["C"] }} />);

    expect(screen.getByText("Directed by")).toBeVisible();
    expect(screen.getByText("A, B")).toBeVisible();
    expect(screen.getByText("Written by")).toBeVisible();
  });

  it("leaves out a line with no names, and renders nothing with none", () => {
    const { container, rerender } = render(
      <MovieCrew movie={{ directors: ["A"], writers: [] }} />,
    );
    expect(screen.queryByText("Written by")).toBeNull();

    rerender(<MovieCrew movie={{ directors: [], writers: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows Created by for a show", () => {
    render(<ShowCrew show={{ createdBy: ["Vince Gilligan"] }} />);

    expect(screen.getByText("Created by")).toBeVisible();
    expect(screen.getByText("Vince Gilligan")).toBeVisible();
  });
});

describe("AgeRatingChip (AC-9, AC-13)", () => {
  it("shows the rating and names the country", () => {
    render(
      <AgeRatingChip rating="16" region={{ code: "DE", name: "Germany" }} />,
    );

    expect(screen.getByText("16")).toBeVisible();
    expect(screen.getByText(/Age rating in Germany/)).toBeInTheDocument();
  });
});

describe("MovieFacts (AC-16)", () => {
  it("lists each fact TMDB has, money in compact US dollars", () => {
    render(<MovieFacts movie={MOVIE} />);

    expect(screen.getByRole("heading", { name: "Facts" })).toBeVisible();
    expect(facts()).toEqual([
      "Status: Released",
      "Original language: English",
      "Budget: $63M",
      "Revenue: $100.9M",
      "Production companies: Fox 2000 Pictures, Regency Enterprises",
    ]);
  });

  it("shows the original title only when it differs", () => {
    render(<MovieFacts movie={{ ...MOVIE, originalTitle: "Le Fight Club" }} />);

    expect(facts()).toContain("Original title: Le Fight Club");
  });

  it("never shows Unknown or 0 for a missing value", () => {
    render(
      <MovieFacts
        movie={{
          ...MOVIE,
          status: null,
          budget: null,
          revenue: null,
          productionCompanies: [],
        }}
      />,
    );

    expect(facts()).toEqual(["Original language: English"]);
    expect(document.body.textContent).not.toMatch(/Unknown|\$0/);
  });
});

describe("ShowFacts (AC-16)", () => {
  it("lists status, type, language, networks and both air dates", () => {
    render(<ShowFacts show={SHOW} />);

    expect(facts()).toEqual([
      "Status: Ended",
      "Type: Scripted",
      "Original language: English",
      "Networks: AMCNo Logo TV",
      "First aired: Jan 20, 2008",
      "Last aired: Sep 29, 2013",
    ]);
  });

  it("leaves out an empty status and missing air dates", () => {
    render(
      <ShowFacts
        show={
          {
            ...SHOW,
            status: "",
            type: null,
            networks: [],
            firstAirDate: null,
            lastAirDate: null,
          } as unknown as TvShow
        }
      />,
    );

    expect(facts()).toEqual(["Original language: English"]);
  });
});
