import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0020, AC-3, AC-4, AC-17
 *
 * The Server Actions, the router and Sonner are the boundaries. Each action is
 * a deferred promise the test settles by hand, so the card can be asserted
 * hidden while the write is in flight and again once it settles.
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

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const toast = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign((...args: unknown[]) => toast(...args), {
    dismiss: vi.fn(),
  }),
}));

const { MissingShowCard } = await import("./missing-show-card");

async function settle(value: unknown) {
  await act(async () => {
    pending.shift()?.(value);
  });
}

/**
 * React entangles every async transition still open, and an optimistic value
 * only reverts once all of them settle. So each test drains what it left in
 * flight, or the next test's card could never come back.
 */
afterEach(async () => {
  await act(async () => {
    while (pending.length > 0) pending.shift()?.({ ok: true, undo: null });
  });
  vi.clearAllMocks();
});

function missingList() {
  return (
    <section>
      <h1 id="library-heading" tabIndex={-1}>
        Watchlist
      </h1>
      <ul>
        <li id="missing-item-40">
          <MissingShowCard
            showId={40}
            itemId="missing-item-40"
            fallbackId="library-heading"
          />
        </li>
      </ul>
    </section>
  );
}

describe("MissingShowCard (AC-17)", () => {
  it("shows No longer on TMDB with no link and only Stop tracking", () => {
    render(missingList());
    expect(
      screen.getByRole("heading", { name: "No longer on TMDB" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Stop tracking missing title" }),
    ).toBeInTheDocument();
  });

  it("stops tracking, hides, moves the focus to the fallback and offers Undo (AC-3)", async () => {
    const user = userEvent.setup();
    render(missingList());
    await user.click(
      screen.getByRole("button", { name: "Stop tracking missing title" }),
    );
    expect(action).toHaveBeenCalledWith("untrack", 40);
    expect(screen.getByRole("heading", { name: "Watchlist" })).toHaveFocus();
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "No longer on TMDB" }),
      ).not.toBeInTheDocument(),
    );
    await settle({ ok: true, undo: { trackedAt: "2026-09-01T10:00:00Z" } });
    expect(toast).toHaveBeenLastCalledWith(
      "Stopped tracking this show",
      expect.objectContaining({
        id: "missing-show-40",
        action: expect.objectContaining({ label: "Undo" }),
      }),
    );
  });

  it("comes back when the write fails", async () => {
    const user = userEvent.setup();
    render(missingList());
    await user.click(
      screen.getByRole("button", { name: "Stop tracking missing title" }),
    );
    await settle({ ok: false, error: "write_failed" });
    expect(
      await screen.findByRole("heading", { name: "No longer on TMDB" }),
    ).toBeInTheDocument();
  });
});
