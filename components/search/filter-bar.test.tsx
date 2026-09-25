import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emptySearchParams, type SearchParams } from "@/lib/search/params";
import type { Genre } from "@/lib/tmdb/types";

import { FilterBar } from "./filter-bar";
import { MobileSearchOverlay } from "./mobile-search-overlay";

/** covers: spec 0010, AC-6, AC-8, AC-9, AC-19, AC-24 */

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
}));

afterEach(() => {
  replace.mockClear();
  push.mockClear();
});

const GENRES: { tv: Genre[] | null; movie: Genre[] | null } = {
  tv: [
    { id: 18, name: "Drama" },
    { id: 10766, name: "Soap" },
  ],
  movie: [
    { id: 18, name: "Drama" },
    { id: 28, name: "Action" },
  ],
};

function bar(overrides: Partial<SearchParams> = {}, genres = GENRES) {
  return (
    <FilterBar
      initial={{ ...emptySearchParams("tv"), ...overrides }}
      genres={genres}
      currentYear={2026}
    />
  );
}

describe("FilterBar", () => {
  it("is a GET form to /search whose controls carry the URL's names", () => {
    const { container } = render(bar({ genreIds: [18] }));
    const form = container.querySelector("form");

    expect(form).toHaveAttribute("action", "/search");
    expect(form).toHaveAttribute("method", "get");
    expect(screen.getByRole("searchbox", { name: "Title" })).toHaveAttribute(
      "name",
      "q",
    );
    expect(screen.getByRole("combobox", { name: "Year" })).toHaveAttribute(
      "name",
      "year",
    );
    // Selected genres travel even before the popover exists.
    expect(
      container.querySelector('input[type="hidden"][name="genre"]'),
    ).toHaveValue("18");
  });

  it("hides Apply once hydrated", async () => {
    render(bar());
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Apply" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("offers next year down to 1900, and the TMDB rating steps", () => {
    render(bar());
    const years = screen.getByRole("combobox", { name: "Year" });
    const options = [...years.querySelectorAll("option")].map((o) => o.text);
    expect(options[0]).toBe("Any year");
    expect(options[1]).toBe("2027");
    expect(options.at(-1)).toBe("1900");

    const ratings = screen.getByRole("combobox", {
      name: "Minimum TMDB rating",
    });
    expect([...ratings.querySelectorAll("option")].map((o) => o.text)).toEqual([
      "Any TMDB rating",
      "5+",
      "6+",
      "7+",
      "8+",
      "9+",
    ]);
  });

  it("applies a change at once by replacing the URL, back on page 1", async () => {
    const user = userEvent.setup();
    render(bar({ q: "dune", page: 4 }));

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Minimum TMDB rating" }),
      "7",
    );

    expect(replace).toHaveBeenCalledWith("/search?type=tv&q=dune&rating=7", {
      scroll: false,
    });
    expect(push).not.toHaveBeenCalled();
    expect(
      screen.getByText("Only titles with at least 100 TMDB votes"),
    ).toBeInTheDocument();
  });

  it("applies the title after a pause", async () => {
    const user = userEvent.setup();
    render(bar());

    await user.type(screen.getByRole("searchbox", { name: "Title" }), "dune");
    expect(replace).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/search?type=tv&q=dune", {
        scroll: false,
      }),
    );
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("maps genres across a type switch and names the ones it drops", async () => {
    const user = userEvent.setup();
    render(bar({ q: "x", genreIds: [18, 10766], year: 2020, rating: 8 }));

    await user.click(screen.getByRole("radio", { name: "MOVIES" }));

    expect(replace).toHaveBeenCalledWith(
      "/search?type=movie&q=x&genre=18&year=2020&rating=8",
      { scroll: false },
    );
    expect(screen.getByText("Removed: Soap")).toBeInTheDocument();
  });

  it("disables only the genre control when TMDB's genre list failed", () => {
    render(bar({}, { tv: null, movie: GENRES.movie }));

    expect(screen.getByRole("button", { name: "Genres" })).toBeDisabled();
    expect(screen.getByText("Genres unavailable")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Year" })).toBeEnabled();
  });

  it("toggles a genre from the popover", async () => {
    const user = userEvent.setup();
    render(bar());

    await user.click(screen.getByRole("button", { name: "Genres" }));
    await user.click(await screen.findByRole("checkbox", { name: "Drama" }));

    expect(replace).toHaveBeenCalledWith("/search?type=tv&genre=18", {
      scroll: false,
    });
  });

  it("clears everything but the type", async () => {
    const user = userEvent.setup();
    render(bar({ type: "movie", q: "dune", year: 2021 }));

    await user.click(screen.getByRole("link", { name: "Clear filters" }));

    expect(replace).toHaveBeenCalledWith("/search?type=movie", {
      scroll: false,
    });
  });
});

describe("MobileSearchOverlay", () => {
  it("opens a full screen search with the field focused, and returns focus on Escape", async () => {
    const user = userEvent.setup();
    render(<MobileSearchOverlay type="movie" />);
    const trigger = screen.getByRole("button", { name: "Search" });

    await user.click(trigger);
    const field = await screen.findByRole("combobox", {
      name: "Search movies",
    });
    await waitFor(() => expect(field).toHaveFocus());
    expect(
      screen.getByRole("button", { name: "Close search" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
