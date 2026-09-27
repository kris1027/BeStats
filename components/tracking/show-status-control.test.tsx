import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ShowStatusState } from "@/lib/tracking/types";

/**
 * covers: spec 0013, AC-1, AC-2, AC-4, AC-21
 *
 * The Server Actions, the router and Sonner are the boundaries. Each action is
 * a deferred promise the test settles by hand, so the optimistic label can be
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
  setShowStatus: (...args: unknown[]) => action("set", ...args),
  restoreShowStatus: (...args: unknown[]) => action("restore", ...args),
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

const { ShowStatusControl } = await import("./show-status-control");

function renderControl(state: ShowStatusState | null) {
  return render(
    <ShowStatusControl
      showId={1396}
      showName="Breaking Bad"
      state={state}
      returnPath="/shows/1396"
    />,
  );
}

const pill = () =>
  screen.getByRole("button", { name: /status for Breaking Bad/ });

async function settle(value: unknown) {
  await act(async () => {
    pending.shift()?.(value);
  });
}

afterEach(() => {
  pending.length = 0;
  vi.clearAllMocks();
});

describe("ShowStatusControl", () => {
  it("reads Add to my shows with no row, and lists the five statuses without Remove (AC-1)", async () => {
    const user = userEvent.setup();
    renderControl(null);
    expect(pill()).toHaveAccessibleName(
      "Add to my shows, status for Breaking Bad",
    );
    expect(pill()).toHaveClass("h-11", "md:h-9");

    await user.click(pill());
    const items = await screen.findAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual([
      "Want to Watch",
      "Watching",
      "On Hold",
      "Dropped",
      "Completed",
    ]);
    expect(
      items.every((item) => item.getAttribute("aria-checked") === "false"),
    ).toBe(true);
    expect(
      screen.queryByRole("menuitem", { name: "Remove status" }),
    ).toBeNull();
  });

  it("checks the current status and offers Remove status when a row exists (AC-1)", async () => {
    const user = userEvent.setup();
    renderControl({ status: "watching", source: "system" });
    expect(pill()).toHaveAccessibleName("Watching, status for Breaking Bad");
    await user.click(pill());
    expect(
      await screen.findByRole("menuitemradio", { name: "Watching" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("menuitem", { name: "Remove status" }),
    ).toBeInTheDocument();
  });

  it("opens with the keyboard and picks a status optimistically, rolling back on failure (AC-1, AC-2)", async () => {
    const user = userEvent.setup();
    renderControl({ status: "watching", source: "user" });
    pill().focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");
    await user.click(screen.getByRole("menuitemradio", { name: "Dropped" }));

    expect(action).toHaveBeenCalledWith("set", 1396, "dropped");
    await waitFor(() =>
      expect(pill()).toHaveAccessibleName("Dropped, status for Breaking Bad"),
    );

    await settle({ ok: false, error: "session_expired" });
    expect(pill()).toHaveAccessibleName("Watching, status for Breaking Bad");
    expect(toast).toHaveBeenCalledWith(
      "Your session expired. Sign in to save this.",
      expect.objectContaining({ id: "show-status-1396" }),
    );
  });

  it("sends nothing when the current status is chosen again, so a system status stays the system's (AC-2)", async () => {
    const user = userEvent.setup();
    renderControl({ status: "watching", source: "system" });
    await user.click(pill());
    await user.click(
      await screen.findByRole("menuitemradio", { name: "Watching" }),
    );
    expect(action).not.toHaveBeenCalled();
  });

  it("removes the status and offers Undo with the reported values (AC-4)", async () => {
    const user = userEvent.setup();
    renderControl({ status: "on_hold", source: "user" });
    await user.click(pill());
    await user.click(
      await screen.findByRole("menuitem", { name: "Remove status" }),
    );

    expect(action).toHaveBeenCalledWith("set", 1396, null);
    await waitFor(() =>
      expect(pill()).toHaveAccessibleName(
        "Add to my shows, status for Breaking Bad",
      ),
    );

    const undo = {
      expected: null,
      status: "on_hold",
      source: "user",
      listedAt: null,
      removedAt: "2026-09-26T10:00:00+00:00",
    };
    await settle({ ok: true, undo });
    expect(toast).toHaveBeenLastCalledWith(
      "Removed Breaking Bad from your shows",
      expect.objectContaining({ id: "show-status-1396" }),
    );

    const options = toast.mock.calls.at(-1)?.[1] as {
      action: { onClick: (event: { preventDefault: () => void }) => void };
    };
    act(() => options.action.onClick({ preventDefault: vi.fn() }));
    expect(action).toHaveBeenLastCalledWith("restore", 1396, undo);
    await settle({ ok: true, undo: null });
    expect(dismiss).toHaveBeenCalledWith("show-status-1396");
  });
});
