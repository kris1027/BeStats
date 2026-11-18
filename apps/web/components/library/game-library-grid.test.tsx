import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LibraryGameItem } from "./types";

/**
 * covers: spec 0027, AC-8 to AC-13; spec 0030, AC-11
 *
 * `removeGame`, `restoreRemovedGame`, the router and Sonner are the
 * boundaries. Each action returns a promise the test settles by hand, so a
 * test can look at the grid while the write is in flight. The app's
 * `refresh()` delivers the next page inside the same transition; here that is
 * a rerender with the new `items`, done before the write settles.
 */
const pending: ((value: unknown) => void)[] = [];
function deferred() {
  return vi.fn(
    (..._args: unknown[]) =>
      new Promise((resolve) => {
        pending.push(resolve);
      }),
  );
}
const removeGame = deferred();
const restoreRemovedGame = deferred();
vi.mock("@/app/games/actions", () => ({
  removeGame: (...args: unknown[]) => removeGame(...args),
  restoreRemovedGame: (...args: unknown[]) => restoreRemovedGame(...args),
  restoreGameStatus: vi.fn(),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/watchlist",
  useSearchParams: () => new URLSearchParams("type=game"),
}));
const toast = vi.fn();
const dismiss = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign((...args: unknown[]) => toast(...args), {
    dismiss: (...args: unknown[]) => dismiss(...args),
  }),
}));

const { GameLibraryGrid } = await import("./game-library-grid");
const { LibraryHeading } = await import("./library-heading");

function item(
  gameId: number,
  overrides: Partial<LibraryGameItem> = {},
): LibraryGameItem {
  return {
    gameId,
    name: `Game ${gameId}`,
    status: "playing",
    coverUrl: null,
    communityRating: 8.1,
    rating: null,
    hidden: false,
    unreleased: null,
    dateLine: null,
    ...overrides,
  };
}

const RETURN_PATH = "/playing?type=game&page=2";

function grid(items: LibraryGameItem[], page = 1) {
  return (
    <>
      <LibraryHeading path="/want-to-play" />
      <GameLibraryGrid
        items={items}
        list="watchlist"
        label={`Your games, page ${page}`}
        page={page}
        returnPath={RETURN_PATH}
      />
    </>
  );
}

async function settleNext(value: unknown) {
  await act(async () => pending.shift()?.(value));
}

const UNDO = {
  kind: "removed",
  previous: {
    status: "playing",
    rating: 8,
    addedAt: "2026-01-01T00:00:00Z",
    startedAt: "2026-02-01T00:00:00Z",
    finishedAt: null,
  },
  removedAt: "2026-10-24T10:00:00Z",
} as const;

afterEach(() => {
  for (const resolve of pending.splice(0)) resolve({ ok: true });
  vi.clearAllMocks();
});

describe("GameLibraryCard through the grid", () => {
  it("links a game to its page with the IGDB community rating and the green bookmark on Want to play", () => {
    render(
      grid([item(1942, { name: "The Witcher 3", status: "want_to_play" })]),
    );

    expect(screen.getByRole("link", { name: "The Witcher 3" })).toHaveAttribute(
      "href",
      "/games/1942",
    );
    expect(screen.getByText("IGDB community rating")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Remove The Witcher 3 from Want to play",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /from your games/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Playing")).not.toBeInTheDocument();
  });

  it.each([
    ["playing", "Playing"],
    ["finished", "Finished"],
  ] as const)(
    "shows the read only %s chip beside the X (spec 0030, AC-11)",
    (status, label) => {
      render(grid([item(1, { status })]));

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getAllByRole("button")).toHaveLength(1);
      expect(
        screen.getByRole("button", { name: "Remove Game 1 from your games" }),
      ).toBeInTheDocument();
    },
  );

  it("removes a Want to play game through the bookmark, with the same Undo", async () => {
    const user = userEvent.setup();
    render(grid([item(1, { status: "want_to_play" })]));

    await user.click(
      screen.getByRole("button", { name: "Remove Game 1 from Want to play" }),
    );
    expect(removeGame).toHaveBeenCalledWith(1);
    await settleNext({ ok: true, undo: UNDO });
    expect(toast).toHaveBeenCalledWith(
      "Removed from your games.",
      expect.objectContaining({ id: "game-undo-1" }),
    );
  });

  it("shows the release pill or Date TBA only on an unreleased Want to play game", () => {
    render(
      grid([
        item(1, {
          unreleased: {
            date: { shortDate: "Feb 3, 2027", fullDate: "Feb 3, 2027" },
          },
        }),
        item(2, { unreleased: { date: null } }),
        item(3),
      ]),
    );

    expect(screen.getByText("Releases Feb 3, 2027")).toBeInTheDocument();
    expect(
      screen.getByText("Release date to be announced"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/^Releases|^Release date/)).toHaveLength(2);
  });

  it("shows the personal score on Playing when there is one, else the community rating", () => {
    render(
      grid([
        item(1, { rating: 9, dateLine: "Started Feb 2026" }),
        item(2, { dateLine: "Started Mar 2026" }),
      ]),
    );

    expect(screen.getAllByText("IGDB community rating")).toHaveLength(1);
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("Started Feb 2026")).toBeInTheDocument();
    expect(screen.getByText("Started Mar 2026")).toBeInTheDocument();
  });

  it("shows the personal score and the Finished month on a scored Finished game", () => {
    render(grid([item(1, { rating: 10, dateLine: "Finished Oct 2026" })]));

    expect(screen.getByText("Your score")).toBeInTheDocument();
    expect(screen.queryByText("IGDB community rating")).not.toBeInTheDocument();
    expect(screen.getByText("Finished Oct 2026")).toBeInTheDocument();
  });

  it("gives a hidden game no link but keeps its remove button", () => {
    render(
      grid([
        item(1, { name: "Hidden Game", hidden: true }),
        item(2, { name: "Hidden Wish", hidden: true, status: "want_to_play" }),
      ]),
    );
    expect(
      screen.getByRole("button", {
        name: "Remove Hidden Wish from Want to play",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: "Hidden Game" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Remove Hidden Game from your games",
      }),
    ).toBeInTheDocument();
  });

  it("shows a missing game as No longer on IGDB, removable, with nothing invented", () => {
    render(
      grid([
        item(1, {
          name: null,
          communityRating: null,
          dateLine: null,
          status: "want_to_play",
        }),
      ]),
    );

    expect(screen.getAllByText("No longer on IGDB").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText("IGDB community rating")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Remove missing game from your games",
      }),
    ).toBeInTheDocument();
  });
});

describe("removal (AC-12, AC-13)", () => {
  it("hides the card at once, then shows the Undo toast", async () => {
    const user = userEvent.setup();
    const view = render(grid([item(1), item(2)]));

    await user.click(
      screen.getByRole("button", { name: "Remove Game 1 from your games" }),
    );
    expect(removeGame).toHaveBeenCalledWith(1);
    expect(screen.queryByText("Game 1")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Game 2" })).toHaveFocus();

    view.rerender(grid([item(2)]));
    await settleNext({ ok: true, undo: UNDO });

    expect(toast).toHaveBeenCalledWith(
      "Removed from your games.",
      expect.objectContaining({ id: "game-undo-1" }),
    );
    expect(screen.queryByText("Game 1")).not.toBeInTheDocument();
  });

  it("restores the removal from the toast's Undo", async () => {
    const user = userEvent.setup();
    render(grid([item(1)]));

    await user.click(
      screen.getByRole("button", { name: "Remove Game 1 from your games" }),
    );
    await settleNext({ ok: true, undo: UNDO });

    const options = toast.mock.calls.at(-1)?.[1] as {
      action: { onClick: (event: { preventDefault: () => void }) => void };
    };
    act(() => options.action.onClick({ preventDefault: vi.fn() }));

    expect(restoreRemovedGame).toHaveBeenCalledWith(
      1,
      UNDO.previous,
      UNDO.removedAt,
    );
  });

  it("is a quiet success when another tab removed the game first", async () => {
    const user = userEvent.setup();
    render(grid([item(1)]));

    await user.click(
      screen.getByRole("button", { name: "Remove Game 1 from your games" }),
    );
    await settleNext({ ok: true });

    expect(toast).not.toHaveBeenCalled();
  });

  it("puts the card back and offers Sign in back to this page when the session expired", async () => {
    const user = userEvent.setup();
    render(grid([item(1)]));

    await user.click(
      screen.getByRole("button", { name: "Remove Game 1 from your games" }),
    );
    await settleNext({ ok: false, error: "session_expired" });

    expect(screen.getByRole("link", { name: "Game 1" })).toBeInTheDocument();
    const [message, options] = toast.mock.calls.at(-1) as [
      string,
      { id: string; action: { onClick: () => void } },
    ];
    expect(message).toBe("Your session expired. Sign in to save this.");
    expect(options.id).toBe("game-tracking-1-status");
    options.action.onClick();
    expect(push).toHaveBeenCalledWith(
      `/sign-in?next=${encodeURIComponent(RETURN_PATH)}`,
    );
  });

  it("puts the card back in place with the error toast when the write fails", async () => {
    const user = userEvent.setup();
    render(grid([item(1), item(2)]));

    await user.click(
      screen.getByRole("button", { name: "Remove Game 1 from your games" }),
    );
    await settleNext({ ok: false, error: "write_failed" });

    const links = screen.getAllByRole("link").map((link) => link.textContent);
    expect(links).toEqual(["Game 1", "Game 2"]);
    expect(toast).toHaveBeenCalledWith(
      "Couldn't save that change. Try again.",
      expect.objectContaining({ id: "game-tracking-1-status" }),
    );
  });

  it("keeps two removals in a row independent, one toast each", async () => {
    const user = userEvent.setup();
    const view = render(grid([item(1), item(2), item(3)]));

    await user.click(
      screen.getByRole("button", { name: "Remove Game 1 from your games" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Remove Game 2 from your games" }),
    );
    expect(removeGame.mock.calls).toEqual([[1], [2]]);
    expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual([
      "Game 3",
    ]);

    view.rerender(grid([item(3)]));
    await settleNext({ ok: true, undo: UNDO });
    await settleNext({ ok: true, undo: UNDO });

    expect(toast.mock.calls.map(([, options]) => options.id)).toEqual([
      "game-undo-1",
      "game-undo-2",
    ]);
  });

  it("focuses a linkless neighbour's remove button, then the heading", async () => {
    const user = userEvent.setup();
    render(grid([item(1), item(2, { hidden: true })]));

    await user.click(
      screen.getByRole("button", { name: "Remove Game 1 from your games" }),
    );
    expect(
      screen.getByRole("button", { name: "Remove Game 2 from your games" }),
    ).toHaveFocus();

    await user.click(
      screen.getByRole("button", { name: "Remove Game 2 from your games" }),
    );
    expect(screen.getByRole("heading", { name: "Want to play" })).toHaveFocus();
  });
});
