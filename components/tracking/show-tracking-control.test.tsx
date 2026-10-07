import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ShowTrackingState } from "@/lib/tracking/types";

/**
 * covers: spec 0020, AC-2 to AC-4
 *
 * The Server Actions, the router and Sonner are the boundaries. Each action is
 * a deferred promise the test settles by hand, so the optimistic pill can be
 * asserted while the write is in flight and again once it settles.
 */
const pending: ((value: unknown) => void)[] = [];
const action = vi.fn(
  (..._args: unknown[]) =>
    new Promise((resolve) => {
      pending.push(resolve);
    }),
);
vi.mock("@/app/shows/actions", () => ({
  trackShow: (...args: unknown[]) => action("track", ...args),
  setShowHold: (...args: unknown[]) => action("hold", ...args),
  untrackShow: (...args: unknown[]) => action("untrack", ...args),
  restoreShowTracking: (...args: unknown[]) => action("restore", ...args),
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

const { ShowTrackingControl } = await import("./show-tracking-control");

function renderControl(state: ShowTrackingState | null) {
  return render(
    <ShowTrackingControl
      showId={1396}
      showName="Breaking Bad"
      state={state}
      returnPath="/shows/1396"
    />,
  );
}

const pill = () =>
  screen.getByRole("button", { name: /tracking for Breaking Bad/ });

async function settle(value: unknown) {
  await act(async () => {
    pending.shift()?.(value);
  });
}

afterEach(() => {
  pending.length = 0;
  vi.clearAllMocks();
});

describe("ShowTrackingControl", () => {
  it("offers Plan to watch for an untracked show, and tracks it optimistically (AC-2)", async () => {
    const user = userEvent.setup();
    renderControl(null);
    const plan = screen.getByRole("button", {
      name: "Plan to watch: Breaking Bad",
    });
    expect(plan).toHaveClass("h-11", "md:h-9");
    await user.click(plan);
    expect(action).toHaveBeenCalledWith("track", 1396);
    await waitFor(() =>
      expect(pill()).toHaveAccessibleName(
        "Tracking, tracking for Breaking Bad",
      ),
    );
    // Settled, so no transition is left open for the next case.
    await settle({ ok: true });
  });

  it("offers Pause, Drop and Stop tracking with no hold (AC-2)", async () => {
    const user = userEvent.setup();
    renderControl({ hold: null });
    expect(pill()).toHaveAccessibleName("Tracking, tracking for Breaking Bad");
    await user.click(pill());
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Pause",
      "Drop",
      "Stop tracking",
    ]);
  });

  it.each([
    ["paused", "Paused", ["Resume", "Drop", "Stop tracking"]],
    ["dropped", "Dropped", ["Resume", "Pause", "Stop tracking"]],
  ] as const)(
    "offers Resume, the other hold and Stop tracking when %s (AC-2)",
    async (hold, label, menu) => {
      const user = userEvent.setup();
      renderControl({ hold });
      expect(pill()).toHaveAccessibleName(
        `${label}, tracking for Breaking Bad`,
      );
      await user.click(pill());
      const items = await screen.findAllByRole("menuitem");
      expect(items.map((item) => item.textContent)).toEqual(menu);
    },
  );

  it("pauses over the hold it showed, rolling back on failure (AC-4)", async () => {
    const user = userEvent.setup();
    renderControl({ hold: null });
    pill().focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");
    await user.click(screen.getByRole("menuitem", { name: "Pause" }));

    expect(action).toHaveBeenCalledWith("hold", 1396, "paused", null);
    await waitFor(() =>
      expect(pill()).toHaveAccessibleName("Paused, tracking for Breaking Bad"),
    );

    await settle({ ok: false, error: "hold_changed" });
    await waitFor(() =>
      expect(pill()).toHaveAccessibleName(
        "Tracking, tracking for Breaking Bad",
      ),
    );
    expect(toast).toHaveBeenCalledWith(
      "This show changed elsewhere. Showing the current one.",
      expect.objectContaining({ id: "show-tracking-1396" }),
    );
  });

  it("resumes a dropped show over the hold it showed", async () => {
    const user = userEvent.setup();
    renderControl({ hold: "dropped" });
    await user.click(pill());
    await user.click(await screen.findByRole("menuitem", { name: "Resume" }));
    expect(action).toHaveBeenCalledWith("hold", 1396, null, "dropped");
  });

  it("stops tracking and offers Undo with the reported values (AC-3)", async () => {
    const user = userEvent.setup();
    renderControl({ hold: "paused" });
    await user.click(pill());
    await user.click(
      await screen.findByRole("menuitem", { name: "Stop tracking" }),
    );

    expect(action).toHaveBeenCalledWith("untrack", 1396, "paused");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Plan to watch: Breaking Bad" }),
      ).toBeInTheDocument(),
    );

    const undo = {
      trackedAt: "2026-09-01T10:00:00+00:00",
      hold: "paused",
      holdChangedAt: "2026-09-02T10:00:00+00:00",
    };
    await settle({ ok: true, undo });
    expect(toast).toHaveBeenLastCalledWith(
      "Stopped tracking Breaking Bad",
      expect.objectContaining({ id: "show-tracking-1396" }),
    );

    const options = toast.mock.calls.at(-1)?.[1] as {
      action: { onClick: (event: { preventDefault: () => void }) => void };
    };
    act(() => options.action.onClick({ preventDefault: vi.fn() }));
    expect(action).toHaveBeenLastCalledWith("restore", 1396, undo);
    await settle({ ok: true });
    expect(dismiss).toHaveBeenCalledWith("show-tracking-1396");
  });
});
