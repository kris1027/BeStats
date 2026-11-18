import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: prompts/catalog-card-status.md, R3
 */
let settle: (value: unknown) => void = () => {};
const setMovieWatched = vi.fn(
  (..._args: unknown[]) =>
    new Promise((resolve) => {
      settle = resolve;
    }),
);
const restoreMovieWatched = vi.fn(async (..._args: unknown[]) => ({
  ok: true,
}));
vi.mock("@/app/movies/actions", () => ({
  setMovieWatched: (...args: unknown[]) => setMovieWatched(...args),
  restoreMovieWatched: (...args: unknown[]) => restoreMovieWatched(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const toast = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign((...args: unknown[]) => toast(...args), {
    dismiss: vi.fn(),
  }),
}));

const { CardWatchedButton } = await import("./card-watched-button");

afterEach(() => {
  vi.clearAllMocks();
});

function renderButton() {
  render(
    <CardWatchedButton movieId={550} title="Fight Club" returnPath="/movies" />,
  );
  return screen.getByRole("button", { name: "Unmark Fight Club as watched" });
}

describe("CardWatchedButton", () => {
  it("is the Watched page's round button with a 44px mobile target", () => {
    expect(renderButton()).toHaveClass("size-11", "md:size-9");
  });

  it("unmarks the movie and offers the Undo that restores its mark and score", async () => {
    const user = userEvent.setup();
    const button = renderButton();
    await user.click(button);
    expect(setMovieWatched).toHaveBeenCalledWith(550, false);
    expect(button).toBeDisabled();

    const watchedAt = "2026-09-23T12:00:00Z";
    await act(async () =>
      settle({ ok: true, cleared: { watchedAt, rating: 8 } }),
    );
    const [message, options] = toast.mock.calls.at(-1) ?? [];
    expect(message).toBe("Score removed too.");
    await act(async () => options.action.onClick({ preventDefault: () => {} }));
    expect(restoreMovieWatched).toHaveBeenCalledWith(550, watchedAt, 8);
  });

  it("shows no toast when no score went with the mark", async () => {
    const user = userEvent.setup();
    await user.click(renderButton());
    await act(async () =>
      settle({
        ok: true,
        cleared: { watchedAt: "2026-09-23T12:00:00Z", rating: null },
      }),
    );
    expect(toast).not.toHaveBeenCalled();
  });

  it("rolls back and says so on a refusal", async () => {
    const user = userEvent.setup();
    const button = renderButton();
    await user.click(button);
    await act(async () => settle({ ok: false, error: "write_failed" }));
    await waitFor(() => expect(button).toBeEnabled());
    expect(toast).toHaveBeenCalledWith(
      "Couldn't save that change. Try again.",
      expect.objectContaining({ id: "movie-tracking-550-watched" }),
    );
  });
});
