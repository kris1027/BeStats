import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EpisodeStates } from "@/lib/tracking/episode-intent";

/**
 * covers: spec 0011, AC-1, AC-2, AC-4, AC-8, AC-10, AC-11, AC-13, AC-14,
 * AC-16, AC-17, AC-18
 *
 * The Server Actions, the router, Sonner and the tracking read are the
 * boundaries. Each action is a deferred promise the test settles by hand, so
 * the optimistic rows and count can be asserted while a write is in flight
 * and again once it settles.
 */
type Deferred = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};
const pending: Deferred[] = [];
const action = vi.fn(
  (..._args: unknown[]) =>
    new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
    }),
);

vi.mock("@/app/shows/actions", () => ({
  setEpisodeWatched: (...args: unknown[]) => action("watched", ...args),
  setEpisodeRating: (...args: unknown[]) => action("rating", ...args),
  setSeasonWatched: (...args: unknown[]) => action("season", ...args),
  undoSeasonWatched: (...args: unknown[]) => action("undo", ...args),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const toast = vi.fn();
const dismiss = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign((...args: unknown[]) => toast(...args), { dismiss }),
}));

const getSeasonEpisodeTracking = vi.fn();
vi.mock("@/lib/tracking/episode-state", () => ({
  getSeasonEpisodeTracking: (...args: unknown[]) =>
    getSeasonEpisodeTracking(...args),
  requestTodayUtc: () => "2026-09-25",
}));

const { SeasonTrackingStore } = await import("./season-tracking-store");
const { SeasonWatchedControl } = await import("./season-watched-control");
const { EpisodeTrackingControls } = await import("./episode-tracking-controls");
const { EpisodeTrackingSlot } = await import("./episode-tracking-slot");
const { SeasonTrackingSlot } = await import("./season-tracking-slot");

const TODAY = "2026-09-25";
const EPISODES = [
  { id: 1, episodeNumber: 1, airDate: "2026-09-01" },
  { id: 2, episodeNumber: 2, airDate: "2026-09-25" },
  { id: 3, episodeNumber: 3, airDate: "2026-09-26" },
];

/** The header and the two aired rows, in one store, as the page wires them. */
function renderSeason(states: EpisodeStates = {}) {
  return render(
    <SeasonTrackingStore
      showId={1396}
      seasonNumber={1}
      returnPath="/shows/1396/season/1"
    >
      <SeasonWatchedControl
        seasonName="Season 1"
        episodes={EPISODES}
        states={states}
        today={TODAY}
      />
      {[1, 2].map((id) => (
        <EpisodeTrackingControls
          key={id}
          episodeId={id}
          label={`Pilot ${id}`}
          state={states[id] ?? { watched: false, rating: null }}
          upcoming={false}
          airDate="Sep 1, 2026"
        />
      ))}
    </SeasonTrackingStore>,
  );
}

const seasonButton = () =>
  screen.getByRole("button", { name: /^Mark Season 1 watched/ });
const row = (id: number) =>
  screen.getByRole("button", { name: `Mark Pilot ${id} watched` });

async function settle(index: number, value: unknown) {
  await act(async () => pending[index].resolve(value));
}

beforeEach(() => {
  pending.length = 0;
});

afterEach(async () => {
  await act(async () => {
    for (const write of pending) write.resolve({ ok: true, undo: null });
  });
  vi.clearAllMocks();
});

describe("the episode controls", () => {
  it("render the stored state with fixed names and aria-pressed (AC-1)", () => {
    renderSeason({ 1: { watched: true, rating: 8 } });
    expect(row(1)).toHaveAttribute("aria-pressed", "true");
    expect(row(1)).toHaveTextContent("Watched");
    expect(row(2)).toHaveAttribute("aria-pressed", "false");
    expect(row(2)).toHaveTextContent("Mark watched");
    expect(
      screen.getByRole("button", { name: "Your score for Pilot 1: 8" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Your score for Pilot 2: Not rated" }),
    ).toBeInTheDocument();
  });

  it("flip at once, move the count, and send the target value (AC-13)", async () => {
    renderSeason();
    expect(screen.getByText("0 of 2 watched")).toBeInTheDocument();
    await userEvent.click(row(1));
    expect(row(1)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 of 2 watched")).toBeInTheDocument();
    expect(action).toHaveBeenCalledWith("watched", 1396, 1, 1, true);
  });

  it("roll back and toast the episode copy when refused (AC-7, AC-13)", async () => {
    renderSeason();
    await userEvent.click(row(1));
    await settle(0, { ok: false, error: "not_aired" });
    expect(row(1)).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("0 of 2 watched")).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(
      "This episode hasn't aired yet.",
      expect.objectContaining({ id: "episode-1-watched" }),
    );
  });

  it("roll back with the write_failed copy when the call rejects (AC-13)", async () => {
    renderSeason();
    await userEvent.click(row(2));
    await act(async () => pending[0].reject(new Error("offline")));
    expect(row(2)).toHaveAttribute("aria-pressed", "false");
    expect(toast).toHaveBeenCalledWith(
      "Couldn't save that change. Try again.",
      expect.anything(),
    );
  });

  it("offer Sign in back to this page when the session expired (AC-14)", async () => {
    renderSeason();
    await userEvent.click(row(1));
    await settle(0, { ok: false, error: "session_expired" });
    const [message, options] = toast.mock.calls[0];
    expect(message).toBe("Your session expired. Sign in to save this.");
    options.action.onClick();
    expect(push).toHaveBeenCalledWith(
      "/sign-in?next=%2Fshows%2F1396%2Fseason%2F1",
    );
  });

  it("a double click sends true then false (AC-16)", async () => {
    renderSeason();
    await userEvent.dblClick(row(1));
    expect(action).toHaveBeenNthCalledWith(1, "watched", 1396, 1, 1, true);
    expect(action).toHaveBeenNthCalledWith(2, "watched", 1396, 1, 1, false);
  });

  it("rating an unwatched episode marks it watched at once (AC-6)", async () => {
    renderSeason();
    await userEvent.click(
      screen.getByRole("button", { name: "Your score for Pilot 1: Not rated" }),
    );
    await userEvent.click(await screen.findByRole("radio", { name: "7" }));
    expect(row(1)).toHaveAttribute("aria-pressed", "true");
    expect(action).toHaveBeenCalledWith("rating", 1396, 1, 1, 7);
  });
});

describe("the removals only controls for a future row with state (AC-2)", () => {
  function renderUpcoming(state: { watched: boolean; rating: number | null }) {
    return render(
      <SeasonTrackingStore showId={1} seasonNumber={1} returnPath="/x">
        <EpisodeTrackingControls
          episodeId={3}
          label="Finale"
          state={state}
          upcoming
          airDate="Sep 26, 2026"
        />
      </SeasonTrackingStore>,
    );
  }

  it("can unmark a watched one", async () => {
    renderUpcoming({ watched: true, rating: null });
    await userEvent.click(
      screen.getByRole("button", { name: "Mark Finale watched" }),
    );
    expect(action).toHaveBeenCalledWith("watched", 1, 1, 3, false);
  });

  it("cannot mark an unwatched one", async () => {
    renderUpcoming({ watched: false, rating: 6 });
    const pill = screen.getByRole("button", { name: "Mark Finale watched" });
    expect(pill).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(pill);
    expect(action).not.toHaveBeenCalled();
  });

  it("offers Clear rating but no score, under the Airs note", async () => {
    renderUpcoming({ watched: false, rating: 6 });
    await userEvent.click(
      screen.getByRole("button", { name: "Your score for Finale: 6" }),
    );
    expect(await screen.findByText("Airs Sep 26, 2026")).toBeInTheDocument();
    const seven = screen.getByRole("radio", { name: "7" });
    expect(seven).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(seven);
    expect(action).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Clear rating" }));
    expect(action).toHaveBeenCalledWith("rating", 1, 1, 3, null);
  });
});

describe("the season button (AC-8 to AC-11)", () => {
  it("counts only aired episodes and names the season (AC-8)", () => {
    renderSeason({ 3: { watched: true, rating: null } });
    expect(seasonButton()).toHaveAttribute("aria-pressed", "false");
    expect(seasonButton()).toHaveTextContent("Mark season watched");
    expect(screen.getByText("0 of 2 watched")).toBeInTheDocument();
  });

  it("reads Season watched when every aired episode is watched", () => {
    renderSeason({
      1: { watched: true, rating: null },
      2: { watched: true, rating: null },
    });
    expect(seasonButton()).toHaveAttribute("aria-pressed", "true");
    expect(seasonButton()).toHaveTextContent("Season watched");
  });

  it("reads Nothing aired yet, focusable but inert, with no count", async () => {
    render(
      <SeasonTrackingStore showId={1} seasonNumber={2} returnPath="/x">
        <SeasonWatchedControl
          seasonName="Season 2"
          episodes={[EPISODES[2]]}
          states={{}}
          today={TODAY}
        />
      </SeasonTrackingStore>,
    );
    const button = screen.getByRole("button", {
      name: /^Mark Season 2 watched/,
    });
    expect(button).toHaveTextContent("Nothing aired yet");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toHaveAttribute("disabled");
    await userEvent.tab();
    expect(button).toHaveFocus();
    await userEvent.click(button);
    expect(action).not.toHaveBeenCalled();
    expect(screen.queryByText(/watched$/)).not.toBeInTheDocument();
  });

  it("marks the season: every aired row flips with the count, then toasts the Undo (AC-10, AC-13)", async () => {
    renderSeason({ 1: { watched: true, rating: 9 } });
    await userEvent.click(seasonButton());
    expect(action).toHaveBeenCalledWith("season", 1396, 1, true);
    expect(row(2)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("2 of 2 watched")).toBeInTheDocument();

    await settle(0, { ok: true, undo: { kind: "unmark", episodeIds: [2] } });
    const [message, options] = toast.mock.calls[0];
    expect(message).toBe("Marked 1 episode watched");
    expect(options.id).toBe("season-1396-1");
    expect(options.action.label).toBe("Undo");

    await act(async () => options.action.onClick({ preventDefault() {} }));
    expect(action).toHaveBeenLastCalledWith("undo", 1396, {
      kind: "unmark",
      episodeIds: [2],
    });
  });

  it("says so when every aired episode was already watched (AC-10)", async () => {
    renderSeason();
    await userEvent.click(seasonButton());
    await settle(0, { ok: true, undo: null });
    expect(toast).toHaveBeenCalledWith(
      "Every aired episode is already watched",
      expect.objectContaining({ action: undefined }),
    );
  });

  it("unmarks every listed episode and offers the dates back (AC-11)", async () => {
    renderSeason({
      1: { watched: true, rating: 9 },
      2: { watched: true, rating: null },
    });
    await userEvent.click(seasonButton());
    expect(action).toHaveBeenCalledWith("season", 1396, 1, false, [1, 2, 3]);
    expect(row(1)).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("0 of 2 watched")).toBeInTheDocument();
    await settle(0, {
      ok: true,
      undo: {
        kind: "restore",
        entries: [
          { episodeId: 1, watchedAt: "2026-01-01T00:00:00+00:00" },
          { episodeId: 2, watchedAt: "2026-01-02T00:00:00+00:00" },
        ],
      },
    });
    expect(toast.mock.calls[0][0]).toBe("Unmarked 2 episodes");
  });

  it("rolls every row and the count back when the season write fails (AC-13)", async () => {
    renderSeason();
    await userEvent.click(seasonButton());
    expect(screen.getByText("2 of 2 watched")).toBeInTheDocument();
    await act(async () => pending[0].reject(new Error("offline")));
    expect(row(1)).toHaveAttribute("aria-pressed", "false");
    expect(row(2)).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("0 of 2 watched")).toBeInTheDocument();
  });

  it("shows the undo_expired copy in place when an Undo is refused (AC-11)", async () => {
    renderSeason({ 1: { watched: true, rating: null } });
    await userEvent.click(seasonButton());
    await settle(0, { ok: true, undo: { kind: "unmark", episodeIds: [2] } });
    await act(async () =>
      toast.mock.calls[0][1].action.onClick({ preventDefault() {} }),
    );
    await settle(1, { ok: false, error: "undo_expired" });
    expect(toast).toHaveBeenLastCalledWith(
      "Couldn't undo. Change the episodes again on this page.",
      expect.objectContaining({ id: "season-1396-1" }),
    );
  });
});

describe("the server slots (AC-4, AC-17, AC-18)", () => {
  const episode = {
    id: 3,
    episodeNumber: 3,
    name: null,
    airDate: "2026-09-26",
  };

  function inStore(node: React.ReactNode) {
    return render(
      <SeasonTrackingStore showId={1396} seasonNumber={1} returnPath="/x">
        {node}
      </SeasonTrackingStore>,
    );
  }

  it("render nothing for a visitor", async () => {
    getSeasonEpisodeTracking.mockResolvedValue({ kind: "signed_out" });
    const { container } = inStore(
      <>
        {await EpisodeTrackingSlot({ showId: 1396, idsKey: "1,2,3", episode })}
        {
          await SeasonTrackingSlot({
            showId: 1396,
            seasonNumber: 1,
            seasonName: "Season 1",
            idsKey: "1,2,3",
            episodes: EPISODES,
          })
        }
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("show Upcoming for a future row with no state, and ask with the season key", async () => {
    getSeasonEpisodeTracking.mockResolvedValue({ kind: "ok", state: {} });
    inStore(
      await EpisodeTrackingSlot({ showId: 1396, idsKey: "1,2,3", episode }),
    );
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(getSeasonEpisodeTracking).toHaveBeenCalledWith(1396, "1,2,3");
  });

  it("show the controls for a future row that already has state, labelled Episode n", async () => {
    getSeasonEpisodeTracking.mockResolvedValue({
      kind: "ok",
      state: { 3: { watched: true, rating: null } },
    });
    inStore(
      await EpisodeTrackingSlot({ showId: 1396, idsKey: "1,2,3", episode }),
    );
    expect(
      screen.getByRole("button", { name: "Mark Episode 3 watched" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("show Upcoming again for a future row whose kept row was emptied by removals", async () => {
    getSeasonEpisodeTracking.mockResolvedValue({
      kind: "ok",
      state: { 3: { watched: false, rating: null } },
    });
    inStore(
      await EpisodeTrackingSlot({ showId: 1396, idsKey: "1,2,3", episode }),
    );
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("put the one retry line in the header and nothing in the rows when the read fails", async () => {
    getSeasonEpisodeTracking.mockResolvedValue({ kind: "failed" });
    const { container } = inStore(
      <>
        <div data-testid="row">
          {
            await EpisodeTrackingSlot({
              showId: 1396,
              idsKey: "1,2,3",
              episode,
            })
          }
        </div>
        {
          await SeasonTrackingSlot({
            showId: 1396,
            seasonNumber: 1,
            seasonName: "Season 1",
            idsKey: "1,2,3",
            episodes: EPISODES,
          })
        }
      </>,
    );
    expect(screen.getByTestId("row")).toBeEmptyDOMElement();
    expect(
      screen.getByText("Couldn't load your tracking."),
    ).toBeInTheDocument();
    expect(
      within(container).getByRole("link", { name: "Try again" }),
    ).toHaveAttribute("href", "/shows/1396/season/1");
  });
});
