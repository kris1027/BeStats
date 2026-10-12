import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  WhereToWatch,
  WhereToWatchError,
  WhereToWatchSkeleton,
} from "./where-to-watch";

/**
 * covers: spec 0022, AC-9, AC-12, AC-18
 *
 * The section's own states, below the slot that reads the extras
 * (`title-extras.test.tsx` covers the read): the heading names the country
 * whenever one is known, the TMDB link appears only beside real providers,
 * and loading keeps the heading without guessing a country.
 */
const POLAND = { code: "PL", name: "Poland" };
const LINK = "https://www.themoviedb.org/movie/550/watch?locale=PL";

describe("WhereToWatch", () => {
  it("leaves the TMDB link out when the country's groups are all empty", () => {
    render(
      <WhereToWatch
        region={POLAND}
        providers={{ link: LINK, stream: [], free: [], rentOrBuy: [] }}
      />,
    );

    expect(
      screen.getByText("Not streaming in Poland right now."),
    ).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("tells assistive technology the TMDB link opens a new tab", () => {
    render(
      <WhereToWatch
        region={POLAND}
        providers={{
          link: LINK,
          stream: [],
          free: [{ id: 1, name: "Pluto TV", logoUrl: null }],
          rentOrBuy: [],
        }}
      />,
    );

    expect(
      screen.getByRole("link", {
        name: /^All options on TMDB\s*\(opens in a new tab\)$/,
      }),
    ).toHaveAttribute("href", LINK);
    expect(screen.getByRole("list", { name: "Free" })).toHaveTextContent(
      "Pluto TV",
    );
  });
});

describe("WhereToWatchSkeleton (AC-18)", () => {
  it("keeps the heading without a country and announces the load", () => {
    render(<WhereToWatchSkeleton />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Where to watch" }),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading where to watch",
    );
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("WhereToWatchError (AC-18)", () => {
  it("still names the country above the one line error", () => {
    render(<WhereToWatchError region={POLAND} href="/shows/1396" />);

    expect(
      screen.getByRole("heading", { name: "Where to watch in Poland" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/shows/1396",
    );
  });
});
