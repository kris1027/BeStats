import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ShowHold } from "@/lib/tracking/types";

/**
 * covers: spec 0020, AC-3, AC-4, AC-10, AC-17
 *
 * The Server Actions, the router and Sonner are the boundaries. Each action is
 * a deferred promise the test settles by hand, so the card can be asserted
 * hidden while the write is in flight and again once it settles. The cards
 * sit in the Paused & dropped grid as the section renders them, beside the
 * disclosure summary the focus falls back to.
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

const { HeldShowCard, MissingShowCard } = await import("./held-show-card");
type CardTitle = import("./held-show-card").CardTitle;
const { HELD_SHOWS_SUMMARY_ID, showCardLinkId } = await import("./ids");

type Card = { showId: number; hold: ShowHold; title: CardTitle };

function found(name: string): CardTitle {
  return { kind: "found", name, posterUrl: null };
}

function section(cards: Card[]) {
  return (
    <details open>
      <summary id={HELD_SHOWS_SUMMARY_ID}>
        Paused & dropped ({cards.length})
      </summary>
      <ul>
        {cards.map((card) => {
          const itemId = `held-show-item-${card.showId}`;
          return (
            <li key={card.showId} id={itemId}>
              <HeldShowCard {...card} itemId={itemId} />
            </li>
          );
        })}
      </ul>
    </details>
  );
}

async function settle(value: unknown) {
  await act(async () => {
    pending.shift()?.(value);
  });
}

/** The arguments of every toast call with this message. */
function toastsSaying(message: string) {
  return toast.mock.calls.filter(([text]) => text === message);
}

/**
 * React entangles every async transition still open, and an optimistic value
 * only reverts once all of them settle. So each test drains what it left in
 * flight, or the next test's card could never come back.
 */
afterEach(async () => {
  await act(async () => {
    while (pending.length > 0) pending.shift()?.({ ok: true, undo: {} });
  });
  vi.clearAllMocks();
});

describe("HeldShowCard with its show", () => {
  it("links the name to the show, labels the hold and offers Resume (AC-10)", () => {
    render(section([{ showId: 10, hold: "dropped", title: found("Lost") }]));
    const link = screen.getByRole("link", { name: "Lost" });
    expect(link).toHaveAttribute("href", "/shows/10");
    expect(link).toHaveAttribute("id", showCardLinkId(10));
    expect(screen.getByText("Dropped")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Resume Lost" }),
    ).toHaveTextContent("Resume");
    expect(
      screen.queryByRole("button", { name: /Stop tracking/ }),
    ).not.toBeInTheDocument();
  });

  it("labels a paused show Paused", () => {
    render(section([{ showId: 10, hold: "paused", title: found("Lost") }]));
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("resumes over the hold it showed and hides at once (AC-4, AC-10)", async () => {
    const user = userEvent.setup();
    render(section([{ showId: 10, hold: "paused", title: found("Lost") }]));
    await user.click(screen.getByRole("button", { name: "Resume Lost" }));
    expect(action).toHaveBeenCalledWith("hold", 10, null, "paused");
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: "Lost" }),
      ).not.toBeInTheDocument(),
    );
    await settle({ ok: true });
    expect(toastsSaying("Resumed Lost")).toEqual([
      ["Resumed Lost", { id: "held-show-10" }],
    ]);
  });

  it("moves the focus to the next card's first control when it leaves (AC-10)", async () => {
    const user = userEvent.setup();
    render(
      section([
        { showId: 10, hold: "paused", title: found("Lost") },
        { showId: 20, hold: "dropped", title: found("Fringe") },
      ]),
    );
    await user.click(screen.getByRole("button", { name: "Resume Lost" }));
    expect(screen.getByRole("button", { name: "Resume Fringe" })).toHaveFocus();
    await settle({ ok: true });
  });

  it("moves the focus to the previous card's first control when it was the last one", async () => {
    const user = userEvent.setup();
    render(
      section([
        { showId: 10, hold: "paused", title: found("Lost") },
        { showId: 20, hold: "dropped", title: found("Fringe") },
      ]),
    );
    await user.click(screen.getByRole("button", { name: "Resume Fringe" }));
    expect(screen.getByRole("button", { name: "Resume Lost" })).toHaveFocus();
    await settle({ ok: true });
  });

  it("moves the focus to the disclosure summary when no card is left", async () => {
    const user = userEvent.setup();
    render(section([{ showId: 10, hold: "paused", title: found("Lost") }]));
    await user.click(screen.getByRole("button", { name: "Resume Lost" }));
    expect(screen.getByText("Paused & dropped (1)")).toHaveFocus();
    await settle({ ok: true });
  });

  it("comes back with the error toast when the resume fails, and says nothing about resuming", async () => {
    const user = userEvent.setup();
    render(section([{ showId: 10, hold: "paused", title: found("Lost") }]));
    await user.click(screen.getByRole("button", { name: "Resume Lost" }));
    await settle({ ok: false, error: "write_failed" });
    expect(
      await screen.findByRole("link", { name: "Lost" }),
    ).toBeInTheDocument();
    expect(toastsSaying("Resumed Lost")).toEqual([]);
    expect(toast).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: "held-show-10" }),
    );
  });

  it("says the show changed elsewhere when the hold it showed is stale (AC-4)", async () => {
    const user = userEvent.setup();
    render(section([{ showId: 10, hold: "paused", title: found("Lost") }]));
    await user.click(screen.getByRole("button", { name: "Resume Lost" }));
    await settle({ ok: false, error: "hold_changed" });
    expect(toast).toHaveBeenCalledWith(
      "This show changed elsewhere. Showing the current one.",
      expect.objectContaining({ id: "held-show-10" }),
    );
  });

  it("offers Sign in back to the Watchlist shows tab when the session expired", async () => {
    const user = userEvent.setup();
    render(section([{ showId: 10, hold: "paused", title: found("Lost") }]));
    await user.click(screen.getByRole("button", { name: "Resume Lost" }));
    await settle({ ok: false, error: "session_expired" });
    const options = toast.mock.calls.at(-1)?.[1] as {
      action: { onClick: () => void };
    };
    options.action.onClick();
    expect(push).toHaveBeenCalledWith(
      `/sign-in?next=${encodeURIComponent("/watchlist?type=tv")}`,
    );
  });

  it("treats a thrown action as a failed write and comes back", async () => {
    action.mockImplementationOnce(() => Promise.reject(new Error("network")));
    const user = userEvent.setup();
    render(section([{ showId: 10, hold: "paused", title: found("Lost") }]));
    await user.click(screen.getByRole("button", { name: "Resume Lost" }));
    expect(
      await screen.findByRole("link", { name: "Lost" }),
    ).toBeInTheDocument();
    expect(toastsSaying("Resumed Lost")).toEqual([]);
  });
});

describe("HeldShowCard without its show (AC-10, AC-17)", () => {
  it("shows a show TMDB no longer has with no link, its hold, Resume and Stop tracking", () => {
    render(
      section([{ showId: 30, hold: "paused", title: { kind: "missing" } }]),
    );
    expect(
      screen.getByRole("heading", { name: "No longer on TMDB" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Resume No longer on TMDB" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Stop tracking No longer on TMDB" }),
    ).toBeInTheDocument();
  });

  it("shows a show whose read failed as Show unavailable, keeping both controls", () => {
    render(
      section([
        { showId: 30, hold: "dropped", title: { kind: "unavailable" } },
      ]),
    );
    expect(
      screen.getByRole("heading", { name: "Show unavailable" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Dropped")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("stops tracking over the hold it showed, hides, and offers Undo that restores it (AC-3, AC-4)", async () => {
    const user = userEvent.setup();
    render(
      section([{ showId: 30, hold: "dropped", title: { kind: "missing" } }]),
    );
    await user.click(
      screen.getByRole("button", { name: "Stop tracking No longer on TMDB" }),
    );
    expect(action).toHaveBeenCalledWith("untrack", 30, "dropped");
    expect(screen.getByText("Paused & dropped (1)")).toHaveFocus();

    const undo = { trackedAt: "2026-09-01T10:00:00.000Z" };
    await settle({ ok: true, undo });
    const [message, options] = toast.mock.calls.at(-1) as [
      string,
      {
        id: string;
        action: {
          label: string;
          onClick: (event: { preventDefault: () => void }) => void;
        };
      },
    ];
    expect(message).toBe("Stopped tracking No longer on TMDB");
    expect(options.id).toBe("held-show-30");
    expect(options.action.label).toBe("Undo");

    await act(async () => {
      options.action.onClick({ preventDefault: vi.fn() });
    });
    expect(action).toHaveBeenLastCalledWith("restore", 30, undo);
    await settle({ ok: true });
    expect(dismiss).toHaveBeenCalledWith("held-show-30");
  });

  it("says the Undo expired when the restore is refused", async () => {
    const user = userEvent.setup();
    render(
      section([{ showId: 30, hold: "dropped", title: { kind: "missing" } }]),
    );
    await user.click(
      screen.getByRole("button", { name: "Stop tracking No longer on TMDB" }),
    );
    await settle({ ok: true, undo: { trackedAt: "x" } });
    const options = toast.mock.calls.at(-1)?.[1] as {
      action: { onClick: (event: { preventDefault: () => void }) => void };
    };
    await act(async () => {
      options.action.onClick({ preventDefault: vi.fn() });
    });
    await settle({ ok: false, error: "undo_expired" });
    expect(toast).toHaveBeenLastCalledWith(
      "Couldn't undo. Track the show again from its page.",
      expect.objectContaining({ id: "held-show-30", action: undefined }),
    );
  });
});

describe("MissingShowCard (AC-17)", () => {
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

  it("stops tracking a show with no hold, hides, and moves the focus to the fallback", async () => {
    const user = userEvent.setup();
    render(missingList());
    await user.click(
      screen.getByRole("button", { name: "Stop tracking missing title" }),
    );
    expect(action).toHaveBeenCalledWith("untrack", 40, null);
    expect(screen.getByRole("heading", { name: "Watchlist" })).toHaveFocus();
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "No longer on TMDB" }),
      ).not.toBeInTheDocument(),
    );
    await settle({ ok: true, undo: { trackedAt: "x" } });
    expect(toast).toHaveBeenLastCalledWith(
      "Stopped tracking this show",
      expect.objectContaining({ id: "missing-show-40" }),
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
