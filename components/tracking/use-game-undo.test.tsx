import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GameUndo } from "@/lib/tracking/types";

/**
 * covers: spec 0026, AC-4, AC-5; spec 0027, AC-12
 *
 * The two restore actions, the router and Sonner are the boundaries.
 * `showGameUndo` is the plain function the games library grid calls once per
 * card, and `useGameUndo` the thin wrapper the game page keeps.
 */
const restoreRemovedGame = vi.fn();
const restoreGameStatus = vi.fn();
vi.mock("@/app/games/actions", () => ({
  restoreRemovedGame: (...args: unknown[]) => restoreRemovedGame(...args),
  restoreGameStatus: (...args: unknown[]) => restoreGameStatus(...args),
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

const { showGameUndo, useGameUndo } = await import("./use-game-undo");

const PREVIOUS = {
  status: "playing",
  rating: 8,
  addedAt: "2026-01-01T00:00:00Z",
  startedAt: "2026-02-01T00:00:00Z",
  finishedAt: null,
} as const;

const REMOVED: GameUndo = {
  kind: "removed",
  previous: PREVIOUS,
  removedAt: "2026-10-24T10:00:00Z",
};
const STATUS: GameUndo = { kind: "status", previous: PREVIOUS };

const RETURN_PATH = "/watched?type=game&page=2";

type ToastOptions = {
  id: string;
  duration: number;
  action: {
    label: string;
    onClick: (event: { preventDefault: () => void }) => void;
  };
};

function lastToast(): [string, ToastOptions] {
  return toast.mock.calls.at(-1) as [string, ToastOptions];
}

function clickUndo() {
  const [, options] = lastToast();
  act(() => options.action.onClick({ preventDefault: vi.fn() }));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("showGameUndo", () => {
  it("shows nothing when the write returned no undo", () => {
    showGameUndo({
      gameId: 1,
      undo: undefined,
      returnPath: RETURN_PATH,
      navigate: push,
    });

    expect(toast).not.toHaveBeenCalled();
  });

  it("offers Undo on a removal for ten seconds, under the game's undo id", () => {
    showGameUndo({
      gameId: 1942,
      undo: REMOVED,
      returnPath: RETURN_PATH,
      navigate: push,
    });

    const [message, options] = lastToast();
    expect(message).toBe("Removed from your games.");
    expect(options.id).toBe("game-undo-1942");
    expect(options.duration).toBe(10_000);
    expect(options.action.label).toBe("Undo");
  });

  it("restores a removal with its old state and removal time", async () => {
    restoreRemovedGame.mockResolvedValue({ ok: true });
    showGameUndo({
      gameId: 1942,
      undo: REMOVED,
      returnPath: RETURN_PATH,
      navigate: push,
    });

    clickUndo();

    expect(restoreRemovedGame).toHaveBeenCalledWith(
      1942,
      PREVIOUS,
      REMOVED.removedAt,
    );
    expect(restoreGameStatus).not.toHaveBeenCalled();
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith("game-undo-1942"));
  });

  it("restores a cleared score through restoreGameStatus", () => {
    restoreGameStatus.mockResolvedValue({ ok: true });
    showGameUndo({
      gameId: 7,
      undo: STATUS,
      returnPath: RETURN_PATH,
      navigate: push,
    });

    expect(lastToast()[0]).toBe(
      "Moved to Want to play. Your score was removed.",
    );
    clickUndo();

    expect(restoreGameStatus).toHaveBeenCalledWith(7, PREVIOUS);
    expect(restoreRemovedGame).not.toHaveBeenCalled();
  });

  it("runs the optimistic restoring callback inside the Undo", async () => {
    restoreRemovedGame.mockResolvedValue({ ok: true });
    const restoring = vi.fn();
    showGameUndo({
      gameId: 1,
      undo: REMOVED,
      returnPath: RETURN_PATH,
      navigate: push,
      restoring,
    });

    clickUndo();

    await waitFor(() => expect(restoring).toHaveBeenCalledTimes(1));
  });

  it("says the Undo expired when the restore is refused as too late", async () => {
    restoreRemovedGame.mockResolvedValue({ ok: false, error: "undo_expired" });
    showGameUndo({
      gameId: 1,
      undo: REMOVED,
      returnPath: RETURN_PATH,
      navigate: push,
    });

    clickUndo();

    await waitFor(() =>
      expect(toast).toHaveBeenLastCalledWith(
        "Couldn't undo. Set the status again on this page.",
        expect.objectContaining({ id: "game-undo-1", action: undefined }),
      ),
    );
  });

  it("offers Sign in back to the page when the session expired during Undo", async () => {
    restoreRemovedGame.mockResolvedValue({
      ok: false,
      error: "session_expired",
    });
    showGameUndo({
      gameId: 1,
      undo: REMOVED,
      returnPath: RETURN_PATH,
      navigate: push,
    });

    clickUndo();

    await waitFor(() =>
      expect(lastToast()[0]).toBe(
        "Your session expired. Sign in to save this.",
      ),
    );
    const [, options] = lastToast();
    expect(options.id).toBe("game-tracking-1-status");
    (options.action.onClick as () => void)();
    expect(push).toHaveBeenCalledWith(
      `/sign-in?next=${encodeURIComponent(RETURN_PATH)}`,
    );
  });
});

describe("useGameUndo", () => {
  it("binds the game, the return path and the router for the game page", async () => {
    restoreRemovedGame.mockResolvedValue({
      ok: false,
      error: "session_expired",
    });
    const { result } = renderHook(() =>
      useGameUndo({ gameId: 42, returnPath: "/games/42" }),
    );

    act(() => result.current(REMOVED));
    expect(lastToast()[1].id).toBe("game-undo-42");
    clickUndo();

    await waitFor(() =>
      expect(lastToast()[1].id).toBe("game-tracking-42-status"),
    );
    (lastToast()[1].action.onClick as () => void)();
    expect(push).toHaveBeenCalledWith(
      `/sign-in?next=${encodeURIComponent("/games/42")}`,
    );
  });
});
