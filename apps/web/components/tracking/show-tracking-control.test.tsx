import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0020, AC-2 to AC-4
 *
 * The Server Actions, the router and Sonner are the boundaries. Each action is
 * a deferred promise the test settles by hand, so the optimistic toggle can be
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

function renderControl(tracked: boolean) {
  return render(
    <ShowTrackingControl
      showId={1396}
      showName="Breaking Bad"
      tracked={tracked}
      returnPath="/shows/1396"
    />,
  );
}

const planButton = () =>
  screen.getByRole("button", { name: "Plan to watch: Breaking Bad" });
const stopButton = () =>
  screen.getByRole("button", { name: "Stop tracking Breaking Bad" });

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
    renderControl(false);
    expect(planButton()).toHaveClass("h-11", "md:h-9");
    await user.click(planButton());
    expect(action).toHaveBeenCalledWith("track", 1396);
    await waitFor(() => expect(stopButton()).toHaveTextContent("Tracking"));
    // Settled, so no transition is left open for the next case.
    await settle({ ok: true });
  });

  it("reads Tracking with no menu, named for the click's action (AC-2)", () => {
    renderControl(true);
    expect(stopButton()).toHaveTextContent("Tracking");
    expect(stopButton()).not.toHaveAttribute("aria-haspopup");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("stops tracking from the keyboard and offers Undo with tracked_at (AC-3)", async () => {
    const user = userEvent.setup();
    renderControl(true);
    stopButton().focus();
    await user.keyboard("{Enter}");

    expect(action).toHaveBeenCalledWith("untrack", 1396);
    await waitFor(() => expect(planButton()).toBeInTheDocument());

    const undo = { trackedAt: "2026-09-01T10:00:00+00:00" };
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
    await waitFor(() => expect(stopButton()).toBeInTheDocument());
    await settle({ ok: true });
    expect(dismiss).toHaveBeenCalledWith("show-tracking-1396");
  });

  it("confirms with no Undo when another tab already stopped it (AC-4)", async () => {
    const user = userEvent.setup();
    renderControl(true);
    await user.click(stopButton());
    await settle({ ok: true, undo: null });
    expect(toast).toHaveBeenLastCalledWith(
      "Stopped tracking Breaking Bad",
      expect.objectContaining({ action: undefined }),
    );
  });

  it("rolls back to Tracking when the write fails", async () => {
    const user = userEvent.setup();
    renderControl(true);
    await user.click(stopButton());
    await waitFor(() => expect(planButton()).toBeInTheDocument());
    await settle({ ok: false, error: "write_failed" });
    await waitFor(() => expect(stopButton()).toBeInTheDocument());
  });
});
