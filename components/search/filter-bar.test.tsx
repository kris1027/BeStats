import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type CatalogRef,
  emptySearchParams,
  type GameSearchParams,
  type SearchParams,
} from "@/lib/search/params";

import { FilterBar } from "./filter-bar";

/** covers: spec 0010, AC-8, AC-9, AC-19, AC-24; spec 0029, AC-9 to AC-11 */

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
}));

afterEach(() => {
  replace.mockClear();
  push.mockClear();
});

const GENRES: Record<"tv" | "movie" | "game", CatalogRef[] | null> = {
  tv: [
    { id: 18, name: "Drama" },
    { id: 10766, name: "Soap" },
  ],
  movie: [
    { id: 18, name: "Drama" },
    { id: 28, name: "Action" },
  ],
  game: Array.from({ length: 25 }, (_, index) => ({
    id: index + 1,
    name: `Game genre ${index + 1}`,
  })),
};

const PLATFORMS: CatalogRef[] = [
  { id: 6, name: "PC (Microsoft Windows)" },
  { id: 130, name: "Nintendo Switch" },
  { id: 508, name: "Nintendo Switch 2" },
  { id: 167, name: "PlayStation 5" },
];

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

  it("has no type control of its own, and submits the type it was given (feature 22)", () => {
    const { container } = render(bar({ type: "movie" }));

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(
      container.querySelector('input[type="hidden"][name="type"]'),
    ).toHaveValue("movie");
    expect(screen.getByRole("searchbox", { name: "Title" })).toHaveAttribute(
      "placeholder",
      "Search movies by title",
    );
  });

  it("resets to a type switch made from the navbar, dropping genres (feature 22)", () => {
    const view = render(bar({ q: "x", genreIds: [10766] }));
    view.rerender(
      <FilterBar
        initial={{ ...emptySearchParams("movie"), q: "x" }}
        genres={GENRES}
        currentYear={2026}
      />,
    );

    expect(screen.getByRole("searchbox", { name: "Title" })).toHaveValue("x");
    expect(
      view.container.querySelector('input[type="hidden"][name="genre"]'),
    ).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("disables only the genre control when TMDB's genre list failed", () => {
    render(bar({}, { ...GENRES, tv: null }));

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

function gameBar(
  overrides: Partial<GameSearchParams> = {},
  platforms: CatalogRef[] | null = PLATFORMS,
) {
  return (
    <FilterBar
      initial={{ ...emptySearchParams("game"), ...overrides }}
      genres={GENRES}
      platforms={platforms}
      currentYear={2026}
    />
  );
}

describe("FilterBar for games (spec 0029)", () => {
  it("labels the rating as IGDB's and offers years down to 1950 (AC-9)", () => {
    render(gameBar({ rating: 7 }));
    const years = screen.getByRole("combobox", { name: "Year" });
    expect([...years.querySelectorAll("option")].at(-1)?.text).toBe("1950");
    const ratings = screen.getByRole("combobox", {
      name: "Minimum IGDB rating",
    });
    expect(ratings.querySelector("option")?.text).toBe("Any IGDB rating");
    expect(
      screen.getByText("Only games with at least 10 IGDB ratings"),
    ).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Title" })).toHaveAttribute(
      "placeholder",
      "Search games by title",
    );
  });

  it("sends selected platforms as hidden inputs and counts them on the trigger (AC-10)", () => {
    const { container } = render(gameBar({ platformIds: [130, 508] }));
    expect(
      [
        ...container.querySelectorAll('input[type="hidden"][name="platform"]'),
      ].map((input) => (input as HTMLInputElement).value),
    ).toEqual(["130", "508"]);
    expect(
      screen.getByRole("button", { name: "Platforms · 2" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Clear filters" }),
    ).toBeInTheDocument();
  });

  it("filters platforms by name, keeping hidden ones checked (AC-10)", async () => {
    const user = userEvent.setup();
    render(gameBar({ platformIds: [6] }));

    await user.click(screen.getByRole("button", { name: "Platforms · 1" }));
    const filter = await screen.findByRole("searchbox", {
      name: "Filter platforms",
    });
    await waitFor(() => expect(filter).toHaveFocus());
    expect(screen.getByText("ON ANY OF")).toBeInTheDocument();

    await user.type(filter, "SWITCH");
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(
      screen.queryByRole("checkbox", { name: "PC (Microsoft Windows)" }),
    ).not.toBeInTheDocument();

    await user.clear(filter);
    await user.type(filter, "zzz");
    expect(screen.getByText("No platforms match")).toBeInTheDocument();

    await user.clear(filter);
    expect(
      screen.getByRole("checkbox", { name: "PC (Microsoft Windows)" }),
    ).toBeChecked();
  });

  it("applies several quick toggles as one navigation after a pause (AC-9)", async () => {
    const user = userEvent.setup();
    render(gameBar());

    await user.click(screen.getByRole("button", { name: "Platforms" }));
    await user.click(
      await screen.findByRole("checkbox", { name: "Nintendo Switch" }),
    );
    await user.click(screen.getByRole("checkbox", { name: "PlayStation 5" }));
    await user.click(screen.getByRole("checkbox", { name: "Nintendo Switch" }));

    expect(
      screen.getByRole("checkbox", { name: "PlayStation 5" }),
    ).toBeChecked();
    expect(replace).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/search?type=game&platform=167", {
        scroll: false,
      }),
    );
    expect(replace).toHaveBeenCalledTimes(1);
  });

  // The text pause and the list pause run on separate timers. Whichever
  // fires first carries both changes, and the other finds the URL already
  // applied, so the pair always makes one read.
  it.each([
    ["the text pause fires first", "text"],
    ["the list pause fires first", "list"],
  ] as const)("makes one navigation when %s (AC-9)", async (_, first) => {
    const user = userEvent.setup();
    render(gameBar());
    const title = screen.getByRole("searchbox", { name: "Title" });

    async function toggle() {
      await user.click(screen.getByRole("button", { name: /^Platforms/ }));
      await user.click(
        await screen.findByRole("checkbox", { name: "Nintendo Switch" }),
      );
      await user.keyboard("{Escape}");
    }

    if (first === "text") {
      await user.type(title, "zelda");
      await toggle();
    } else {
      await toggle();
      await user.type(title, "zelda");
    }

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "/search?type=game&q=zelda&platform=130",
        { scroll: false },
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("stops at 20 genres, disabling the rest (AC-10)", async () => {
    const user = userEvent.setup();
    const twenty = Array.from({ length: 20 }, (_, index) => index + 1);
    render(gameBar({ genreIds: twenty }));

    await user.click(screen.getByRole("button", { name: "Genres · 20" }));
    expect(
      await screen.findByRole("checkbox", { name: "Game genre 21" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: "Game genre 1" }),
    ).toBeEnabled();
    expect(screen.getByText("Up to 20")).toBeInTheDocument();
  });

  it("disables only Platforms when IGDB's platform list failed (AC-11)", () => {
    render(gameBar({}, null));
    expect(screen.getByRole("button", { name: "Platforms" })).toBeDisabled();
    expect(screen.getByText("Platforms unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Genres" })).toBeEnabled();
  });
});
