import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LibraryItem } from "./types";

/**
 * covers: spec 0008, AC-1, AC-2, AC-5 to AC-7, AC-11, AC-16, AC-18
 *
 * The four actions, the router and Sonner are the boundaries. Each action
 * returns a promise the test settles by hand, so a test can look at the grid
 * while the write is still in flight. The real app's `refresh()` delivers the
 * next page inside the same transition; here that is a rerender with the new
 * `items`, done before the write settles.
 */
const pending: ((value: unknown) => void)[] = [];
function deferred() {
  return vi.fn(
    (..._args: unknown[]) =>
      new Promise((resolve) => {
        pending.push(resolve);
      }),
  );
}
const setMovieWatchlist = deferred();
const setMovieWatched = deferred();
const restoreMovieWatchlist = deferred();
const restoreMovieWatched = deferred();
vi.mock("@/app/movies/actions", () => ({
  setMovieWatchlist: (...args: unknown[]) => setMovieWatchlist(...args),
  setMovieWatched: (...args: unknown[]) => setMovieWatched(...args),
  restoreMovieWatchlist: (...args: unknown[]) => restoreMovieWatchlist(...args),
  restoreMovieWatched: (...args: unknown[]) => restoreMovieWatched(...args),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const toast = vi.fn();
const dismiss = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign((...args: unknown[]) => toast(...args), {
    dismiss: (...args: unknown[]) => dismiss(...args),
  }),
}));

const { LibraryGrid } = await import("./library-grid");
const { LibraryHeading } = await import("./library-heading");

function item(movieId: number, overrides: Partial<LibraryItem> = {}) {
  return {
    movieId,
    title: `Movie ${movieId}`,
    posterUrl: null,
    tmdbRating: 7.5,
    rating: null,
    watchedAt: null,
    ...overrides,
  } satisfies LibraryItem;
}

function grid(list: "watchlist" | "watched", items: LibraryItem[], page = 1) {
  return (
    <>
      <LibraryHeading>Heading</LibraryHeading>
      <LibraryGrid
        list={list}
        items={items}
        label={`Your list, page ${page}`}
        page={page}
        returnPath="/watchlist?page=2"
      />
    </>
  );
}

/**
 * What the redirect after emptying a later page does in the app: the page
 * segment remounts, so a new heading replaces the one holding the focus.
 */
function remount(view: ReturnType<typeof render>, items: LibraryItem[]) {
  view.unmount();
  return render(grid("watchlist", items));
}

/** Settles the oldest write still in flight. */
async function settleNext(value: unknown) {
  await act(async () => pending.shift()?.(value));
}

/**
 * The Undo handler from the most recent removal toast, bound to a click whose
 * `preventDefault` the test can inspect.
 */
const undoClick = { preventDefault: vi.fn() };
function lastUndo(): () => void {
  const options = toast.mock.calls.at(-1)?.[1] as {
    action: { onClick: (event: typeof undoClick) => void };
  };
  return () => options.action.onClick(undoClick);
}

afterEach(() => {
  pending.length = 0;
  vi.clearAllMocks();
});

describe("LibraryGrid on the watchlist", () => {
  it("renders each card with its title link, TMDB badge and remove button (AC-1)", () => {
    render(grid("watchlist", [item(550, { title: "Fight Club" })]));
    expect(screen.getByRole("link", { name: "Fight Club" })).toHaveAttribute(
      "href",
      "/movies/550",
    );
    expect(screen.getByText("TMDB rating")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Fight Club from Watchlist" }),
    ).toHaveClass("size-11", "md:size-9");
  });

  it("hides the card at once, then confirms with an Undo toast (AC-5)", async () => {
    const user = userEvent.setup();
    const { rerender } = render(grid("watchlist", [item(1), item(2)]));

    await user.click(
      screen.getByRole("button", { name: "Remove Movie 1 from Watchlist" }),
    );
    expect(
      screen.queryByRole("link", { name: "Movie 1" }),
    ).not.toBeInTheDocument();
    expect(setMovieWatchlist).toHaveBeenCalledWith(1, false);

    rerender(grid("watchlist", [item(2)]));
    await settleNext({ ok: true });

    expect(
      screen.queryByRole("link", { name: "Movie 1" }),
    ).not.toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(
      "Removed from Watchlist",
      expect.objectContaining({
        id: "library-watchlist-1",
        action: expect.objectContaining({ label: "Undo" }),
      }),
    );
  });

  it("brings the card back with an error toast when the write fails (AC-5)", async () => {
    const user = userEvent.setup();
    render(grid("watchlist", [item(1), item(2)]));

    await user.click(
      screen.getByRole("button", { name: "Remove Movie 1 from Watchlist" }),
    );
    await settleNext({ ok: false, error: "write_failed" });

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Movie 1" })).toBeInTheDocument(),
    );
    expect(toast).toHaveBeenCalledWith(
      "Couldn't save that change. Try again.",
      expect.objectContaining({ id: "movie-tracking-1-watchlist" }),
    );
  });

  it("offers Sign in with the page as the return path on an expired session (AC-5)", async () => {
    const user = userEvent.setup();
    render(grid("watchlist", [item(1)]));

    await user.click(
      screen.getByRole("button", { name: "Remove Movie 1 from Watchlist" }),
    );
    await settleNext({ ok: false, error: "session_expired" });

    const options = toast.mock.calls.at(-1)?.[1] as {
      action: { onClick: () => void };
    };
    options.action.onClick();
    expect(push).toHaveBeenCalledWith("/sign-in?next=%2Fwatchlist%3Fpage%3D2");
  });

  it("undoes through restoreMovieWatchlist, and explains a refused Undo (AC-6)", async () => {
    const user = userEvent.setup();
    const { rerender } = render(grid("watchlist", [item(1)]));

    await user.click(
      screen.getByRole("button", { name: "Remove Movie 1 from Watchlist" }),
    );
    rerender(grid("watchlist", []));
    await settleNext({ ok: true });

    act(() => lastUndo()());
    expect(restoreMovieWatchlist).toHaveBeenCalledWith(1);
    // The toast stays open, without its Undo, until the restore answers.
    expect(undoClick.preventDefault).toHaveBeenCalled();
    expect(toast).toHaveBeenLastCalledWith("Removed from Watchlist", {
      id: "library-watchlist-1",
      action: undefined,
    });
    await settleNext({ ok: false, error: "undo_expired" });
    expect(dismiss).not.toHaveBeenCalled();

    expect(toast).toHaveBeenLastCalledWith(
      "Couldn't undo. Plan it again from the movie page.",
      expect.objectContaining({ id: "library-watchlist-1" }),
    );
    // Sonner merges an update into the removal toast, so the refusal must
    // name `action` and `description` to drop the dead Undo and score line.
    const refusal = toast.mock.calls.at(-1)?.[1] as object;
    expect(Object.hasOwn(refusal, "action")).toBe(true);
    expect(Object.hasOwn(refusal, "description")).toBe(true);
    expect(refusal).toMatchObject({
      action: undefined,
      description: undefined,
    });
  });

  it("closes the toast once an Undo succeeds (AC-6)", async () => {
    const user = userEvent.setup();
    render(grid("watchlist", [item(1)]));
    await user.click(
      screen.getByRole("button", { name: "Remove Movie 1 from Watchlist" }),
    );
    await settleNext({ ok: true });

    act(() => lastUndo()());
    expect(dismiss).not.toHaveBeenCalled();
    await settleNext({ ok: true });
    expect(dismiss).toHaveBeenCalledWith("library-watchlist-1");
  });

  it("closes the toast and shows the error when an Undo fails (AC-6)", async () => {
    const user = userEvent.setup();
    render(grid("watchlist", [item(1)]));
    await user.click(
      screen.getByRole("button", { name: "Remove Movie 1 from Watchlist" }),
    );
    await settleNext({ ok: true });

    act(() => lastUndo()());
    await settleNext({ ok: false, error: "write_failed" });
    expect(dismiss).toHaveBeenCalledWith("library-watchlist-1");
    expect(toast).toHaveBeenLastCalledWith(
      "Couldn't save that change. Try again.",
      expect.objectContaining({ id: "movie-tracking-1-watchlist" }),
    );
  });

  it("gives each of several quick removals its own toast and its own Undo (AC-18)", async () => {
    const user = userEvent.setup();
    const { rerender } = render(grid("watchlist", [item(1), item(2), item(3)]));

    await user.click(
      screen.getByRole("button", { name: "Remove Movie 1 from Watchlist" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Remove Movie 2 from Watchlist" }),
    );
    expect(
      screen.queryByRole("link", { name: "Movie 1" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Movie 2" }),
    ).not.toBeInTheDocument();

    rerender(grid("watchlist", [item(3)]));
    await settleNext({ ok: true });
    await settleNext({ ok: true });

    const ids = toast.mock.calls.map((call) => (call[1] as { id: string }).id);
    expect(ids).toEqual(["library-watchlist-1", "library-watchlist-2"]);

    act(() => lastUndo()());
    expect(restoreMovieWatchlist).toHaveBeenCalledTimes(1);
    expect(restoreMovieWatchlist).toHaveBeenCalledWith(2);
  });
});

describe("LibraryGrid on the watched page", () => {
  it("shows the score only when the movie has one, and no TMDB rating (AC-2)", () => {
    render(
      grid("watched", [
        item(1, { rating: 9, watchedAt: "2026-09-23T12:00:00+00:00" }),
        item(2, { rating: null, watchedAt: "2026-09-22T12:00:00+00:00" }),
      ]),
    );
    expect(screen.getAllByText("Your score")).toHaveLength(1);
    expect(screen.queryByText("TMDB rating")).not.toBeInTheDocument();
    expect(screen.queryByText("Not rated")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Unmark Movie 2 as watched" }),
    ).toBeInTheDocument();
  });

  it("says the score is kept, and undoes with the rendered watched time (AC-7)", async () => {
    const user = userEvent.setup();
    const watchedAt = "2026-09-23T12:16:58.070024+00:00";
    const { rerender } = render(
      grid("watched", [item(1, { rating: 9, watchedAt })]),
    );

    await user.click(
      screen.getByRole("button", { name: "Unmark Movie 1 as watched" }),
    );
    expect(setMovieWatched).toHaveBeenCalledWith(1, false);
    rerender(grid("watched", []));
    await settleNext({ ok: true });

    expect(toast).toHaveBeenCalledWith(
      "Removed from Watched",
      expect.objectContaining({ description: "Your score is kept." }),
    );

    act(() => lastUndo()());
    expect(restoreMovieWatched).toHaveBeenCalledWith(1, watchedAt);
    await settleNext({ ok: false, error: "undo_expired" });
    expect(toast).toHaveBeenLastCalledWith(
      "Couldn't undo. Mark it watched again from the movie page.",
      { id: "library-watched-1" },
    );
  });

  it("adds no score line for an unrated movie (AC-7)", async () => {
    const user = userEvent.setup();
    render(grid("watched", [item(1, { watchedAt: "2026-09-23T12:00:00Z" })]));

    await user.click(
      screen.getByRole("button", { name: "Unmark Movie 1 as watched" }),
    );
    await settleNext({ ok: true });
    expect(toast).toHaveBeenCalledWith(
      "Removed from Watched",
      expect.objectContaining({ description: undefined }),
    );
  });
});

describe("a title TMDB no longer has (AC-11)", () => {
  it("keeps the card with no title link, and a remove button", () => {
    render(grid("watchlist", [item(1, { title: null })]));
    expect(screen.getAllByText("No longer on TMDB").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Remove missing title from Watchlist",
      }),
    ).toBeInTheDocument();
  });
});

describe("focus after a removal (AC-16)", () => {
  it("moves to the next card's title link", async () => {
    const user = userEvent.setup();
    render(grid("watchlist", [item(1), item(2)]));
    await user.click(
      screen.getByRole("button", { name: "Remove Movie 1 from Watchlist" }),
    );
    expect(screen.getByRole("link", { name: "Movie 2" })).toHaveFocus();
  });

  it("moves to the previous card's title link when there is no next card", async () => {
    const user = userEvent.setup();
    render(grid("watchlist", [item(1), item(2)]));
    await user.click(
      screen.getByRole("button", { name: "Remove Movie 2 from Watchlist" }),
    );
    expect(screen.getByRole("link", { name: "Movie 1" })).toHaveFocus();
  });

  it("moves to the heading when the list is now empty", async () => {
    const user = userEvent.setup();
    render(grid("watchlist", [item(1)]));
    await user.click(
      screen.getByRole("button", { name: "Remove Movie 1 from Watchlist" }),
    );
    expect(screen.getByRole("heading", { name: "Heading" })).toHaveFocus();
  });

  it("moves to the new heading after emptying a later page remounts it (AC-9)", async () => {
    const user = userEvent.setup();
    const view = render(grid("watchlist", [item(21)], 2));
    await user.click(
      screen.getByRole("button", { name: "Remove Movie 21 from Watchlist" }),
    );
    await settleNext({ ok: true });

    remount(view, [item(1)]);
    expect(screen.getByRole("heading", { name: "Heading" })).toHaveFocus();
  });

  it("leaves a later mount alone after emptying page 1, which never redirects", async () => {
    const user = userEvent.setup();
    const view = render(grid("watchlist", [item(1)]));
    await user.click(
      screen.getByRole("button", { name: "Remove Movie 1 from Watchlist" }),
    );
    await settleNext({ ok: true });

    remount(view, [item(2)]);
    expect(screen.getByRole("heading", { name: "Heading" })).not.toHaveFocus();
  });

  it("leaves a later mount alone when the removal failed", async () => {
    const user = userEvent.setup();
    const view = render(grid("watchlist", [item(21)], 2));
    await user.click(
      screen.getByRole("button", { name: "Remove Movie 21 from Watchlist" }),
    );
    await settleNext({ ok: false, error: "write_failed" });

    remount(view, [item(1)]);
    expect(screen.getByRole("heading", { name: "Heading" })).not.toHaveFocus();
  });

  it("leaves a later mount alone when later pages moved up instead of a redirect", async () => {
    const user = userEvent.setup();
    const view = render(grid("watchlist", [item(21)], 2));
    await user.click(
      screen.getByRole("button", { name: "Remove Movie 21 from Watchlist" }),
    );
    view.rerender(grid("watchlist", [item(41)], 2));
    await settleNext({ ok: true });

    remount(view, [item(1)]);
    expect(screen.getByRole("heading", { name: "Heading" })).not.toHaveFocus();
  });

  it("keeps the remount focus when a different removal fails", async () => {
    const user = userEvent.setup();
    const view = render(grid("watchlist", [item(21), item(22)], 2));
    await user.click(
      screen.getByRole("button", { name: "Remove Movie 21 from Watchlist" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Remove Movie 22 from Watchlist" }),
    );
    await settleNext({ ok: false, error: "write_failed" });
    await settleNext({ ok: true });

    remount(view, [item(1)]);
    expect(screen.getByRole("heading", { name: "Heading" })).toHaveFocus();
  });

  it("moves to a missing title's remove button, which has no link", async () => {
    const user = userEvent.setup();
    render(grid("watchlist", [item(1), item(2, { title: null })]));
    await user.click(
      screen.getByRole("button", { name: "Remove Movie 1 from Watchlist" }),
    );
    expect(
      screen.getByRole("button", {
        name: "Remove missing title from Watchlist",
      }),
    ).toHaveFocus();
  });
});
