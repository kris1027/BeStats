import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0015, AC-5, AC-7
 *
 * The action, the router and Sonner are the boundaries. The refresh that
 * follows a mark is played by rerendering the list: without the card when the
 * mark completed the show, with it when it did not.
 */
const setEpisodeWatched = vi.fn();
vi.mock("@/app/shows/actions", () => ({
  setEpisodeWatched: (...args: unknown[]) => setEpisodeWatched(...args),
  undoEpisodeMark: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const toast = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign((...args: unknown[]) => toast(...args), {
    dismiss: vi.fn(),
  }),
}));

const { MarkNextWatchedButton } = await import("./mark-next-watched-button");
const { UP_NEXT_HEADING_ID, UPCOMING_EMPTY_HEADING_ID, upNextCardLinkId } =
  await import("./ids");

/**
 * The Up Next section as the page renders it, with a button on each card.
 * `advanced` is the show whose next episode the refresh moved on.
 */
function list(showIds: number[], advanced?: number) {
  return (
    <section>
      <h2 id={UP_NEXT_HEADING_ID} tabIndex={-1}>
        Up Next
      </h2>
      <ul>
        {showIds.map((showId) => (
          <li key={showId}>
            <a id={upNextCardLinkId(showId)} href={`/shows/${showId}`}>
              Show {showId}
            </a>
            <MarkNextWatchedButton
              showId={showId}
              showName={`Show ${showId}`}
              seasonNumber={1}
              episodeNumber={showId === advanced ? 9 : 8}
              episodeId={showId * 10 + (showId === advanced ? 1 : 0)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function marked(showCompleted: boolean, newlyMarked = true) {
  return {
    ok: true,
    showStarted: false,
    showCompleted,
    newlyMarked,
    markedAt: newlyMarked ? "2026-09-30T10:00:00.000Z" : null,
  };
}

async function markAndRefresh(
  showId: number,
  before: number[],
  after: number[],
  advanced?: number,
) {
  const view = render(list(before));
  await userEvent.click(
    screen.getByRole("button", {
      name: `Mark Show ${showId} season 1 episode 8 watched`,
    }),
  );
  await waitFor(() => expect(toast).toHaveBeenCalled());
  view.rerender(list(after, advanced));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("a mark that completes the show (spec 0015)", () => {
  it("says so in one toast, with the card's Undo (AC-5)", async () => {
    setEpisodeWatched.mockResolvedValue({ ...marked(true), showStarted: true });
    await markAndRefresh(2, [1, 2, 3], [1, 3]);

    expect(toast).toHaveBeenCalledOnce();
    const [message, options] = toast.mock.calls[0];
    expect(message).toBe("Marked Show 2 S1E8 watched · Moved to Completed");
    expect(options.action.label).toBe("Undo");
  });

  it("moves the focus to the next card once its card leaves (AC-7)", async () => {
    setEpisodeWatched.mockResolvedValue(marked(true));
    await markAndRefresh(2, [1, 2, 3], [1, 3]);
    await waitFor(() =>
      expect(document.activeElement?.id).toBe(upNextCardLinkId(3)),
    );
  });

  it("falls back to the previous card for the last one (AC-7)", async () => {
    setEpisodeWatched.mockResolvedValue(marked(true));
    await markAndRefresh(3, [1, 2, 3], [1, 2]);
    await waitFor(() =>
      expect(document.activeElement?.id).toBe(upNextCardLinkId(2)),
    );
  });

  it("falls back to the Up Next heading when no card is left (AC-7)", async () => {
    setEpisodeWatched.mockResolvedValue(marked(true));
    await markAndRefresh(1, [1], []);
    await waitFor(() =>
      expect(document.activeElement?.id).toBe(UP_NEXT_HEADING_ID),
    );
  });

  it("falls back to the empty page's heading when the page empties (AC-7)", async () => {
    setEpisodeWatched.mockResolvedValue(marked(true));
    const view = render(list([1]));
    await userEvent.click(
      screen.getByRole("button", {
        name: "Mark Show 1 season 1 episode 8 watched",
      }),
    );
    await waitFor(() => expect(toast).toHaveBeenCalled());
    // With Coming soon empty too, the page renders its one empty panel, and
    // neither section heading is left.
    view.rerender(
      <section>
        <h2 id={UPCOMING_EMPTY_HEADING_ID} tabIndex={-1}>
          Nothing upcoming yet
        </h2>
      </section>,
    );
    await waitFor(() =>
      expect(document.activeElement?.id).toBe(UPCOMING_EMPTY_HEADING_ID),
    );
  });

  it("names the move alone, with no Undo, for a mark made elsewhere", async () => {
    setEpisodeWatched.mockResolvedValue(marked(true, false));
    await markAndRefresh(2, [1, 2], [1]);
    const [message, options] = toast.mock.calls[0];
    expect(message).toBe("Show 2 moved to Completed");
    expect(options.action).toBeUndefined();
  });
});

describe("a mark that does not complete the show", () => {
  it("keeps the plain toast and the focus on its own card (spec 0014, AC-16)", async () => {
    setEpisodeWatched.mockResolvedValue(marked(false));
    await markAndRefresh(2, [1, 2, 3], [2, 1, 3], 2);
    expect(toast.mock.calls[0][0]).toBe("Marked Show 2 S1E8 watched");
    await waitFor(() =>
      expect(document.activeElement?.id).toBe(upNextCardLinkId(2)),
    );
  });
});
