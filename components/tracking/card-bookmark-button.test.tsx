import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0007, AC-11, AC-16
 */
let settle: (value: unknown) => void = () => {};
const setMovieWatchlist = vi.fn(
  (..._args: unknown[]) =>
    new Promise((resolve) => {
      settle = resolve;
    }),
);
vi.mock("@/app/movies/actions", () => ({
  setMovieWatchlist: (...args: unknown[]) => setMovieWatchlist(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const toast = vi.fn();
vi.mock("sonner", () => ({ toast: (...args: unknown[]) => toast(...args) }));

const { CardBookmarkButton } = await import("./card-bookmark-button");

afterEach(() => {
  vi.clearAllMocks();
});

describe("CardBookmarkButton", () => {
  it("carries the fixed name and a 44px mobile target (AC-16)", () => {
    render(
      <CardBookmarkButton
        movieId={550}
        title="Fight Club"
        inWatchlist
        returnPath="/movies"
      />,
    );
    const button = screen.getByRole("button", { name: "Plan Fight Club" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveClass("size-11", "md:size-9");
  });

  it("toggles optimistically and rolls back on a refusal (AC-11)", async () => {
    const user = userEvent.setup();
    render(
      <CardBookmarkButton
        movieId={550}
        title="Fight Club"
        inWatchlist={false}
        returnPath="/movies?page=2"
      />,
    );
    const button = screen.getByRole("button", { name: "Plan Fight Club" });
    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(setMovieWatchlist).toHaveBeenCalledWith(550, true);

    await act(async () => settle({ ok: false, error: "write_failed" }));
    await waitFor(() =>
      expect(button).toHaveAttribute("aria-pressed", "false"),
    );
    expect(toast).toHaveBeenCalledWith(
      "Couldn't save that change. Try again.",
      expect.objectContaining({ id: "movie-tracking-550-watchlist" }),
    );
  });
});
