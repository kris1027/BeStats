import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MovieTrackingState } from "@/lib/tracking/types";

/**
 * covers: spec 0007, AC-1, AC-7, AC-9, AC-10, AC-11, AC-12, AC-15
 *
 * The Server Actions, the router and Sonner are the boundaries. Each action is
 * a deferred promise the test settles by hand, so the optimistic state can be
 * asserted while the write is in flight and again once it settles.
 */
type Deferred = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};
const pending: Deferred[] = [];
const deferredAction = vi.fn(
  (..._args: unknown[]) =>
    new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
    }),
);

vi.mock("@/app/movies/actions", () => ({
  setMovieWatchlist: (...args: unknown[]) =>
    deferredAction("watchlist", ...args),
  setMovieWatched: (...args: unknown[]) => deferredAction("watched", ...args),
  setMovieRating: (...args: unknown[]) => deferredAction("rating", ...args),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const toast = vi.fn();
vi.mock("sonner", () => ({ toast: (...args: unknown[]) => toast(...args) }));

const { MovieTrackingControls } = await import("./movie-tracking-controls");

const EMPTY: MovieTrackingState = {
  inWatchlist: false,
  watched: false,
  rating: null,
};

function renderControls(state: MovieTrackingState = EMPTY) {
  return render(
    <MovieTrackingControls
      movieId={550}
      title="Fight Club"
      state={state}
      returnPath="/movies/550"
    />,
  );
}

const plan = () => screen.getByRole("button", { name: "Plan Fight Club" });
const watched = () =>
  screen.getByRole("button", { name: "Mark Fight Club watched" });
const score = () =>
  screen.getByRole("button", { name: /^Your score for Fight Club/ });

async function settle(index: number, value: unknown) {
  await act(async () => pending[index].resolve(value));
}

beforeEach(() => {
  pending.length = 0;
});

afterEach(async () => {
  // React entangles every in flight async transition, so an optimistic value
  // only reverts once all of them settle. A test that leaves a write pending
  // would otherwise hold the next test's rollback open.
  await act(async () => {
    for (const write of pending) write.resolve({ ok: true });
  });
  vi.clearAllMocks();
});

describe("MovieTrackingControls", () => {
  it("renders the stored state with fixed names and aria-pressed (AC-1)", () => {
    renderControls({ inWatchlist: true, watched: true, rating: 8 });
    expect(plan()).toHaveAttribute("aria-pressed", "true");
    expect(plan()).toHaveTextContent("Planned");
    expect(watched()).toHaveAttribute("aria-pressed", "true");
    expect(watched()).toHaveTextContent("Watched");
    expect(score()).toHaveAccessibleName("Your score for Fight Club: 8");
  });

  it("shows an integer score with no decimal and Not rated for none (AC-10)", () => {
    const { rerender } = renderControls({ ...EMPTY, rating: 8 });
    expect(score()).toHaveTextContent(/^8$/);
    rerender(
      <MovieTrackingControls
        movieId={550}
        title="Fight Club"
        state={EMPTY}
        returnPath="/movies/550"
      />,
    );
    expect(score()).toHaveTextContent("Not rated");
  });

  it("flips at once and sends the target value (AC-11)", async () => {
    const user = userEvent.setup();
    renderControls();
    await user.click(plan());
    expect(plan()).toHaveAttribute("aria-pressed", "true");
    expect(deferredAction).toHaveBeenCalledWith("watchlist", 550, true);
  });

  it("a first watch also clears the bookmark optimistically", async () => {
    const user = userEvent.setup();
    renderControls({ ...EMPTY, inWatchlist: true });
    await user.click(watched());
    expect(watched()).toHaveAttribute("aria-pressed", "true");
    expect(plan()).toHaveAttribute("aria-pressed", "false");
  });

  it("rolls back and toasts when the action refuses (AC-11)", async () => {
    const user = userEvent.setup();
    renderControls();
    await user.click(plan());
    await settle(0, { ok: false, error: "tmdb_unavailable" });
    await waitFor(() =>
      expect(plan()).toHaveAttribute("aria-pressed", "false"),
    );
    expect(toast).toHaveBeenCalledWith(
      "Couldn't reach TMDB. Try again in a moment.",
      expect.objectContaining({ id: "movie-tracking-550-watchlist" }),
    );
  });

  it("rolls back with the write_failed copy when the call rejects (AC-11)", async () => {
    const user = userEvent.setup();
    renderControls();
    await user.click(watched());
    await act(async () => pending[0].reject(new Error("Failed to fetch")));
    await waitFor(() =>
      expect(watched()).toHaveAttribute("aria-pressed", "false"),
    );
    expect(toast).toHaveBeenCalledWith(
      "Couldn't save that change. Try again.",
      expect.objectContaining({ id: "movie-tracking-550-watched" }),
    );
  });

  it("offers Sign in back to this page when the session expired (AC-12)", async () => {
    const user = userEvent.setup();
    renderControls();
    await user.click(plan());
    await settle(0, { ok: false, error: "session_expired" });
    await waitFor(() => expect(toast).toHaveBeenCalled());
    const [message, options] = toast.mock.calls[0];
    expect(message).toBe("Your session expired. Sign in to save this.");
    expect(options.action.label).toBe("Sign in");
    options.action.onClick();
    expect(push).toHaveBeenCalledWith("/sign-in?next=%2Fmovies%2F550");
  });

  it("a double click sends true then false (AC-15)", async () => {
    const user = userEvent.setup();
    renderControls();
    await user.dblClick(plan());
    expect(deferredAction).toHaveBeenNthCalledWith(1, "watchlist", 550, true);
    expect(deferredAction).toHaveBeenNthCalledWith(2, "watchlist", 550, false);
  });
});

describe("the score picker (AC-7)", () => {
  it("opens a titled radio group of ten, with no Clear rating when unrated", async () => {
    const user = userEvent.setup();
    renderControls();
    await user.click(score());
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Your score")).toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", { name: "Your score" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(10);
    expect(screen.queryByRole("button", { name: "Clear rating" })).toBeNull();
  });

  it("moves focus with the arrows without saving, and commits on Enter", async () => {
    const user = userEvent.setup();
    renderControls();
    await user.click(score());
    await screen.findByRole("dialog");
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "1" })).toHaveFocus(),
    );

    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowDown}");
    expect(screen.getByRole("radio", { name: "8" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "7" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("radio", { name: "2" })).toHaveFocus();
    expect(deferredAction).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    expect(deferredAction).toHaveBeenCalledWith("rating", 550, 2);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(score()).toHaveAccessibleName("Your score for Fight Club: 2");
  });

  it("closes on Escape without saving and returns focus to the pill", async () => {
    const user = userEvent.setup();
    renderControls({ ...EMPTY, rating: 6 });
    await user.click(score());
    await screen.findByRole("dialog");
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "6" })).toHaveFocus(),
    );
    expect(screen.getByRole("radio", { name: "6" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(score()).toHaveFocus();
    expect(deferredAction).not.toHaveBeenCalled();
  });

  it("clears the rating (AC-9)", async () => {
    const user = userEvent.setup();
    renderControls({ inWatchlist: false, watched: true, rating: 6 });
    await user.click(score());
    await user.click(
      await screen.findByRole("button", { name: "Clear rating" }),
    );
    expect(deferredAction).toHaveBeenCalledWith("rating", 550, null);
    expect(score()).toHaveAccessibleName(
      "Your score for Fight Club: Not rated",
    );
    expect(watched()).toHaveAttribute("aria-pressed", "true");
  });
});
