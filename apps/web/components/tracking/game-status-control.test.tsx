import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GameTrackingState } from "@/lib/tracking/types";

/**
 * covers: spec 0026, AC-2 to AC-8, AC-11
 *
 * The Server Actions, the router and Sonner are the boundaries. Each action
 * is a deferred promise the test settles by hand, so the optimistic state is
 * asserted while the write is in flight and again once it settles.
 */
type Deferred = { resolve: (value: unknown) => void };
const pending: Deferred[] = [];
const deferredAction = vi.fn(
  (..._args: unknown[]) =>
    new Promise((resolve) => {
      pending.push({ resolve });
    }),
);

vi.mock("@/app/games/actions", () => ({
  setGameStatus: (...args: unknown[]) => deferredAction("status", ...args),
  setGameRating: (...args: unknown[]) => deferredAction("rating", ...args),
  removeGame: (...args: unknown[]) => deferredAction("remove", ...args),
  restoreGameStatus: (...args: unknown[]) =>
    deferredAction("restoreStatus", ...args),
  restoreRemovedGame: (...args: unknown[]) =>
    deferredAction("restoreRemoved", ...args),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const toast = vi.fn();
const dismiss = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign((...args: unknown[]) => toast(...args), { dismiss }),
}));

const { GameStatusControl } = await import("./game-status-control");

const NONE: GameTrackingState = { status: null, rating: null };
const UNRELEASED = "Releases Oct 24, 2027";

function renderControl(
  state: GameTrackingState = NONE,
  releaseNote: string | null = null,
) {
  return render(
    <GameStatusControl
      gameId={1942}
      name="The Witcher 3"
      state={state}
      returnPath="/games/1942"
      releaseNote={releaseNote}
    />,
  );
}

const pill = (label: string) =>
  screen.getByRole("button", { name: `${label}: The Witcher 3` });
const score = () =>
  screen.queryByRole("button", { name: /^Your score for The Witcher 3/ });

async function settle(index: number, value: unknown) {
  await act(async () => pending[index].resolve(value));
}

beforeEach(() => {
  pending.length = 0;
});

afterEach(async () => {
  await act(async () => {
    for (const write of pending) write.resolve({ ok: true });
  });
  vi.clearAllMocks();
});

describe("GameStatusControl", () => {
  it("renders three toggles in a labelled group, the stored one pressed (AC-2)", () => {
    renderControl({ status: "playing", rating: 8 });
    expect(
      screen.getByRole("group", { name: "Status for The Witcher 3" }),
    ).toBeInTheDocument();
    expect(pill("Want to play")).toHaveAttribute("aria-pressed", "false");
    expect(pill("Playing")).toHaveAttribute("aria-pressed", "true");
    expect(pill("Finished")).toHaveAttribute("aria-pressed", "false");
    expect(score()).toHaveAccessibleName("Your score for The Witcher 3: 8");
  });

  it("shows no score pill with no status or on Want to play (AC-2)", () => {
    renderControl({ status: "want_to_play", rating: null });
    expect(score()).toBeNull();
  });

  it("reads Rate with no score, with the Not rated name (AC-6)", () => {
    renderControl({ status: "playing", rating: null });
    expect(score()).toHaveTextContent("Rate");
    expect(score()).toHaveAccessibleName(
      "Your score for The Witcher 3: Not rated",
    );
  });

  it("sets a status at once and sends the target (AC-3, AC-11)", async () => {
    const user = userEvent.setup();
    renderControl();
    await user.click(pill("Playing"));
    expect(pill("Playing")).toHaveAttribute("aria-pressed", "true");
    expect(deferredAction).toHaveBeenCalledWith("status", 1942, "playing");
  });

  it("removes through the pressed pill and offers Undo (AC-4)", async () => {
    const user = userEvent.setup();
    renderControl({ status: "want_to_play", rating: null });
    await user.click(pill("Want to play"));
    expect(deferredAction).toHaveBeenCalledWith("remove", 1942);
    expect(pill("Want to play")).toHaveAttribute("aria-pressed", "false");
    await settle(0, {
      ok: true,
      undo: {
        kind: "removed",
        removedAt: "2026-10-24T10:00:00+00:00",
        previous: {
          status: "want_to_play",
          rating: null,
          addedAt: "2026-09-01T10:00:00+00:00",
          startedAt: null,
          finishedAt: null,
        },
      },
    });
    expect(toast).toHaveBeenCalledWith(
      "Removed from your games.",
      expect.objectContaining({ id: "game-undo-1942" }),
    );
  });

  it("shows no toast for a removal that found nothing (AC-4)", async () => {
    const user = userEvent.setup();
    renderControl({ status: "playing", rating: null });
    await user.click(pill("Playing"));
    await settle(0, { ok: true });
    expect(toast).not.toHaveBeenCalled();
  });

  it("toasts the score cleared Undo on a move to Want to play (AC-5)", async () => {
    const user = userEvent.setup();
    renderControl({ status: "finished", rating: 9 });
    await user.click(pill("Want to play"));
    expect(score()).toBeNull();
    await settle(0, {
      ok: true,
      undo: {
        kind: "status",
        previous: {
          status: "finished",
          rating: 9,
          addedAt: "2026-09-01T10:00:00+00:00",
          startedAt: null,
          finishedAt: "2026-09-20T10:00:00+00:00",
        },
      },
    });
    expect(toast).toHaveBeenCalledWith(
      "Moved to Want to play. Your score was removed.",
      expect.objectContaining({ id: "game-undo-1942" }),
    );
  });

  it("opens the picker on a move into unscored Finished, not into Playing (AC-7)", async () => {
    const user = userEvent.setup();
    renderControl({ status: "want_to_play", rating: null });
    await user.click(pill("Playing"));
    expect(screen.queryByRole("radiogroup")).toBeNull();
    await settle(0, { ok: true });
    await user.click(pill("Finished"));
    expect(
      await screen.findByRole("radiogroup", { name: "Your score" }),
    ).toBeInTheDocument();
  });

  it("does not open the picker on a move into Finished with a score (AC-7)", async () => {
    const user = userEvent.setup();
    renderControl({ status: "playing", rating: 8 });
    await user.click(pill("Finished"));
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("closes the picker and rolls back when the Finished write fails (AC-7, AC-11)", async () => {
    const user = userEvent.setup();
    renderControl();
    await user.click(pill("Finished"));
    expect(await screen.findByRole("radiogroup")).toBeInTheDocument();
    await settle(0, { ok: false, error: "write_failed" });
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(pill("Finished")).toHaveAttribute("aria-pressed", "false");
    expect(toast).toHaveBeenCalledWith(
      "Couldn't save that change. Try again.",
      expect.objectContaining({ id: "game-tracking-1942-status" }),
    );
  });

  it("toasts only the status error when a queued score fails behind it (AC-11)", async () => {
    const user = userEvent.setup();
    renderControl();
    await user.click(pill("Finished"));
    await user.click(await screen.findByRole("radio", { name: "8" }));
    expect(deferredAction).toHaveBeenCalledWith("rating", 1942, 8);
    await settle(0, { ok: false, error: "igdb_unavailable" });
    await settle(1, { ok: false, error: "not_started" });
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(
      "Couldn't reach IGDB. Try again.",
      expect.anything(),
    );
    expect(pill("Finished")).toHaveAttribute("aria-pressed", "false");
  });

  it("holds back Playing and Finished before release, with the line (AC-8)", async () => {
    const user = userEvent.setup();
    renderControl(NONE, UNRELEASED);
    expect(screen.getByText(UNRELEASED)).toBeInTheDocument();
    expect(pill("Playing")).toHaveAttribute("aria-disabled", "true");
    expect(pill("Finished")).toHaveAttribute("aria-disabled", "true");
    expect(pill("Want to play")).not.toHaveAttribute("aria-disabled");
    await user.click(pill("Playing"));
    expect(deferredAction).not.toHaveBeenCalled();
  });

  it("lets a stored Playing game be removed or moved back before release (AC-8)", async () => {
    const user = userEvent.setup();
    renderControl({ status: "playing", rating: 6 }, UNRELEASED);
    expect(pill("Playing")).not.toHaveAttribute("aria-disabled");
    expect(pill("Finished")).toHaveAttribute("aria-disabled", "true");
    expect(score()).not.toBeNull();
    await user.click(score() as HTMLElement);
    expect(
      await screen.findByText(UNRELEASED, { selector: "p[id]" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "8" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("carries Sign in on a session expired toast (AC-10)", async () => {
    const user = userEvent.setup();
    renderControl();
    await user.click(pill("Want to play"));
    await settle(0, { ok: false, error: "session_expired" });
    const options = toast.mock.calls[0][1] as {
      action: { label: string; onClick: () => void };
    };
    expect(options.action.label).toBe("Sign in");
    options.action.onClick();
    expect(push).toHaveBeenCalledWith("/sign-in?next=%2Fgames%2F1942");
  });
  describe("the Undo in the toast (AC-4, AC-5, AC-14)", () => {
    const REMOVED = {
      kind: "removed",
      removedAt: "2026-10-24T10:00:00+00:00",
      previous: {
        status: "finished",
        rating: 9,
        addedAt: "2026-09-01T10:00:00+00:00",
        startedAt: "2026-09-02T10:00:00+00:00",
        finishedAt: "2026-09-20T10:00:00+00:00",
      },
    } as const;

    async function removeThenUndo() {
      const user = userEvent.setup();
      const { rerender } = renderControl({ status: "finished", rating: 9 });
      await user.click(pill("Finished"));
      await settle(0, { ok: true, undo: REMOVED });
      // What refresh() delivers after the removal: the row is gone.
      rerender(
        <GameStatusControl
          gameId={1942}
          name="The Witcher 3"
          state={NONE}
          returnPath="/games/1942"
          releaseNote={null}
        />,
      );
      const options = toast.mock.calls[0][1] as {
        action: { onClick: (event: { preventDefault: () => void }) => void };
      };
      await act(async () =>
        options.action.onClick({ preventDefault: () => {} }),
      );
    }

    it("restores a removal with the exact values and time it returned, showing them at once", async () => {
      await removeThenUndo();
      expect(deferredAction).toHaveBeenLastCalledWith(
        "restoreRemoved",
        1942,
        REMOVED.previous,
        REMOVED.removedAt,
      );
      expect(pill("Finished")).toHaveAttribute("aria-pressed", "true");
      expect(score()).toHaveAccessibleName("Your score for The Witcher 3: 9");
    });

    it("dismisses the toast once the restore lands", async () => {
      await removeThenUndo();
      await settle(1, { ok: true });
      expect(dismiss).toHaveBeenCalledWith("game-undo-1942");
    });

    it("says the Undo expired when the restore is refused, and rolls back", async () => {
      await removeThenUndo();
      await settle(1, { ok: false, error: "undo_expired" });
      expect(toast).toHaveBeenLastCalledWith(
        "Couldn't undo. Set the status again on this page.",
        expect.objectContaining({ id: "game-undo-1942" }),
      );
      expect(pill("Finished")).toHaveAttribute("aria-pressed", "false");
    });

    it("restores a cleared score through restoreGameStatus", async () => {
      const user = userEvent.setup();
      renderControl({ status: "finished", rating: 9 });
      await user.click(pill("Want to play"));
      await settle(0, {
        ok: true,
        undo: { kind: "status", previous: REMOVED.previous },
      });
      const options = toast.mock.calls[0][1] as {
        action: { onClick: (event: { preventDefault: () => void }) => void };
      };
      await act(async () =>
        options.action.onClick({ preventDefault: () => {} }),
      );
      expect(deferredAction).toHaveBeenLastCalledWith(
        "restoreStatus",
        1942,
        REMOVED.previous,
      );
    });
  });
});
