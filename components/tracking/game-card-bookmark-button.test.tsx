import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0030, AC-3, AC-4, AC-5
 *
 * The Server Actions and the toast are the boundaries. Each action call
 * waits on `settle`, so a test can look at the button while the write is in
 * flight.
 */
let settle: (value: unknown) => void = () => {};
function pending() {
  return new Promise((resolve) => {
    settle = resolve;
  });
}
const setGameStatus = vi.fn((..._args: unknown[]) => pending());
const removeGame = vi.fn((..._args: unknown[]) => pending());
const restoreRemovedGame = vi.fn(async (..._args: unknown[]) => ({
  ok: true,
}));
const restoreGameStatus = vi.fn(async (..._args: unknown[]) => ({
  ok: true,
}));
vi.mock("@/app/games/actions", () => ({
  setGameStatus: (...args: unknown[]) => setGameStatus(...args),
  removeGame: (...args: unknown[]) => removeGame(...args),
  restoreRemovedGame: (...args: unknown[]) => restoreRemovedGame(...args),
  restoreGameStatus: (...args: unknown[]) => restoreGameStatus(...args),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const toast = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign((...args: unknown[]) => toast(...args), {
    dismiss: vi.fn(),
  }),
}));

const { GameCardBookmarkButton } = await import("./game-card-bookmark-button");

afterEach(() => {
  vi.clearAllMocks();
});

const NAME = "Want to play: The Witcher 3";
const PREVIOUS = {
  status: "want_to_play" as const,
  rating: null,
  addedAt: "2026-10-01T10:00:00Z",
  startedAt: null,
  finishedAt: null,
};

function renderButton(inList: boolean, returnPath = "/games") {
  render(
    <GameCardBookmarkButton
      gameId={1942}
      name="The Witcher 3"
      inList={inList}
      returnPath={returnPath}
    />,
  );
  return screen.getByRole("button", { name: NAME });
}

describe("GameCardBookmarkButton", () => {
  it("carries the accessible name, pressed state and a 44px mobile target (AC-3)", () => {
    const button = renderButton(true);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveClass("size-11", "md:size-9");
  });

  it("adds an unowned game with no toast (AC-3, AC-5)", async () => {
    const user = userEvent.setup();
    const button = renderButton(false);
    await user.click(button);
    expect(setGameStatus).toHaveBeenCalledWith(1942, "want_to_play");
    expect(button).toHaveAttribute("aria-pressed", "true");

    await act(async () => settle({ ok: true }));
    expect(toast).not.toHaveBeenCalled();
  });

  it("refuses a second tap while the write is in flight (AC-4)", async () => {
    const user = userEvent.setup();
    const button = renderButton(false);
    await user.click(button);
    expect(button).toBeDisabled();
    await user.click(button);
    expect(setGameStatus).toHaveBeenCalledTimes(1);
    expect(removeGame).not.toHaveBeenCalled();

    await act(async () => settle({ ok: true }));
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it("rolls back on a failure and offers Sign in back to the grid when the session expired (AC-4)", async () => {
    const user = userEvent.setup();
    const button = renderButton(false, "/search?type=game&q=witcher");
    await user.click(button);
    await act(async () => settle({ ok: false, error: "session_expired" }));

    await waitFor(() =>
      expect(button).toHaveAttribute("aria-pressed", "false"),
    );
    const [, options] = toast.mock.calls.at(-1) ?? [];
    expect(options.id).toBe("game-tracking-1942-status");
    options.action.onClick();
    expect(push).toHaveBeenCalledWith(
      `/sign-in?next=${encodeURIComponent("/search?type=game&q=witcher")}`,
    );
  });

  it("removes a wanted game with the shared Undo, which restores the row (AC-5)", async () => {
    const user = userEvent.setup();
    const button = renderButton(true);
    await user.click(button);
    expect(removeGame).toHaveBeenCalledWith(1942);
    expect(button).toHaveAttribute("aria-pressed", "false");

    const removedAt = "2026-10-26T10:00:00Z";
    await act(async () =>
      settle({
        ok: true,
        undo: { kind: "removed", previous: PREVIOUS, removedAt },
      }),
    );
    const [message, options] = toast.mock.calls.at(-1) ?? [];
    expect(message).toBe("Removed from your games.");
    expect(options.id).toBe("game-undo-1942");
    await act(async () => options.action.onClick({ preventDefault: () => {} }));
    expect(restoreRemovedGame).toHaveBeenCalledWith(1942, PREVIOUS, removedAt);
  });

  it("adding over a stale scored card shows the score cleared Undo (AC-5)", async () => {
    const user = userEvent.setup();
    renderButton(false);
    await user.click(screen.getByRole("button", { name: NAME }));
    const previous = { ...PREVIOUS, status: "playing" as const, rating: 8 };
    await act(async () =>
      settle({ ok: true, undo: { kind: "status", previous } }),
    );
    const [message, options] = toast.mock.calls.at(-1) ?? [];
    expect(message).toBe("Moved to Want to play. Your score was removed.");
    await act(async () => options.action.onClick({ preventDefault: () => {} }));
    expect(restoreGameStatus).toHaveBeenCalledWith(1942, previous);
  });

  it("toggles from the keyboard with Enter and Space (spec 0030, AC-15)", async () => {
    const user = userEvent.setup();
    const button = renderButton(false);
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(setGameStatus).toHaveBeenCalledTimes(1);
    await act(async () => settle({ ok: true }));
    await waitFor(() => expect(button).not.toBeDisabled());
    // No refresh here, so the card is unpressed again and Space adds again.
    button.focus();
    await user.keyboard(" ");
    expect(setGameStatus).toHaveBeenCalledTimes(2);
  });
});
