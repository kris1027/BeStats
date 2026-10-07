import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0020, AC-3, AC-4, AC-6
 */
const trackShow = vi.fn(async (..._args: unknown[]) => ({ ok: true }));
const untrackShow = vi.fn(async (..._args: unknown[]) => ({
  ok: true,
  undo: {
    trackedAt: "2026-09-01T10:00:00+00:00",
    hold: "paused",
    holdChangedAt: "2026-09-02T10:00:00+00:00",
  },
}));
const restoreShowTracking = vi.fn(async (..._args: unknown[]) => ({
  ok: true,
}));
vi.mock("@/app/shows/actions", () => ({
  trackShow: (...args: unknown[]) => trackShow(...args),
  untrackShow: (...args: unknown[]) => untrackShow(...args),
  restoreShowTracking: (...args: unknown[]) => restoreShowTracking(...args),
  setShowHold: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const toast = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign((...args: unknown[]) => toast(...args), {
    dismiss: vi.fn(),
  }),
}));

const { ShowCardBookmarkButton } = await import("./show-card-bookmark-button");

afterEach(() => {
  vi.clearAllMocks();
});

describe("ShowCardBookmarkButton (AC-6)", () => {
  it("is empty for an untracked show, and a click tracks it", async () => {
    const user = userEvent.setup();
    render(
      <ShowCardBookmarkButton
        showId={1399}
        name="Game of Thrones"
        state={null}
        returnPath="/shows"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Track Game of Thrones" }),
    );
    expect(trackShow).toHaveBeenCalledWith(1399);
  });

  it.each([null, "paused", "dropped"] as const)(
    "is filled for a tracked show (hold %s), and a click stops tracking over that hold (AC-4)",
    async (hold) => {
      const user = userEvent.setup();
      render(
        <ShowCardBookmarkButton
          showId={1399}
          name="Game of Thrones"
          state={{ hold }}
          returnPath="/shows"
        />,
      );
      await user.click(
        screen.getByRole("button", { name: "Stop tracking Game of Thrones" }),
      );
      expect(untrackShow).toHaveBeenCalledWith(1399, hold);
    },
  );

  it("offers the Undo of Stop tracking with the reported values (AC-3)", async () => {
    const user = userEvent.setup();
    render(
      <ShowCardBookmarkButton
        showId={1399}
        name="Game of Thrones"
        state={{ hold: "paused" }}
        returnPath="/shows"
      />,
    );
    await user.click(screen.getByRole("button"));
    expect(toast).toHaveBeenLastCalledWith(
      "Stopped tracking Game of Thrones",
      expect.objectContaining({ id: "show-bookmark-1399" }),
    );
    const options = toast.mock.calls.at(-1)?.[1] as {
      action: { onClick: (event: { preventDefault: () => void }) => void };
    };
    await act(async () => options.action.onClick({ preventDefault: vi.fn() }));
    expect(restoreShowTracking).toHaveBeenCalledWith(1399, {
      trackedAt: "2026-09-01T10:00:00+00:00",
      hold: "paused",
      holdChangedAt: "2026-09-02T10:00:00+00:00",
    });
  });

  it("says Couldn't undo when the show is tracked again already (AC-3)", async () => {
    restoreShowTracking.mockResolvedValueOnce({
      ok: false,
      error: "undo_expired",
    } as never);
    const user = userEvent.setup();
    render(
      <ShowCardBookmarkButton
        showId={1399}
        name="Game of Thrones"
        state={{ hold: null }}
        returnPath="/shows"
      />,
    );
    await user.click(screen.getByRole("button"));
    const options = toast.mock.calls.at(-1)?.[1] as {
      action: { onClick: (event: { preventDefault: () => void }) => void };
    };
    await act(async () => options.action.onClick({ preventDefault: vi.fn() }));
    expect(toast).toHaveBeenLastCalledWith(
      "Couldn't undo. Track the show again from its page.",
      expect.objectContaining({ id: "show-bookmark-1399" }),
    );
  });
});
