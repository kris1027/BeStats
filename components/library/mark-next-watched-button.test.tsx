import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0014, AC-8, AC-16; spec 0020, AC-9
 *
 * The action, the router and Sonner are the boundaries. The refresh that
 * follows a mark is played by rerendering the list: without the card when
 * classification moved the show to Upcoming or Watched, with it (and its next
 * episode) when the show stayed on Watchlist.
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
const { LIBRARY_HEADING_ID, showCardLinkId } = await import("./ids");

/**
 * The Watchlist shows grid as the page renders it, with a button on each
 * card.
 * `advanced` is the show whose next episode the refresh moved on.
 */
function list(showIds: number[], advanced?: number) {
  return (
    <section>
      <h1 id={LIBRARY_HEADING_ID} tabIndex={-1}>
        Watchlist
      </h1>
      <ul>
        {showIds.map((showId) => (
          <li key={showId}>
            <a id={showCardLinkId(showId)} href={`/shows/${showId}`}>
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

function marked(newlyMarked = true) {
  return {
    ok: true,
    showTracked: false,
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

describe("a mark that moves the show off Watchlist (spec 0020, AC-9)", () => {
  it("confirms with one toast carrying the card's Undo", async () => {
    setEpisodeWatched.mockResolvedValue(marked());
    await markAndRefresh(2, [1, 2, 3], [1, 3]);

    expect(toast).toHaveBeenCalledOnce();
    const [message, options] = toast.mock.calls[0];
    expect(message).toBe("Marked Show 2 S1E8 watched");
    expect(options.action.label).toBe("Undo");
  });

  it("moves the focus to the next card once its card leaves", async () => {
    setEpisodeWatched.mockResolvedValue(marked());
    await markAndRefresh(2, [1, 2, 3], [1, 3]);
    await waitFor(() =>
      expect(document.activeElement?.id).toBe(showCardLinkId(3)),
    );
  });

  it("falls back to the previous card for the last one", async () => {
    setEpisodeWatched.mockResolvedValue(marked());
    await markAndRefresh(3, [1, 2, 3], [1, 2]);
    await waitFor(() =>
      expect(document.activeElement?.id).toBe(showCardLinkId(2)),
    );
  });

  it("falls back to the page heading when no card is left", async () => {
    setEpisodeWatched.mockResolvedValue(marked());
    await markAndRefresh(1, [1], []);
    await waitFor(() =>
      expect(document.activeElement?.id).toBe(LIBRARY_HEADING_ID),
    );
  });

  it("offers no Undo for a mark made elsewhere", async () => {
    setEpisodeWatched.mockResolvedValue(marked(false));
    await markAndRefresh(2, [1, 2], [1]);
    const [message, options] = toast.mock.calls[0];
    expect(message).toBe("Show 2 S1E8 was already watched");
    expect(options.action).toBeUndefined();
  });
});

describe("a mark that keeps the show on Watchlist", () => {
  it("keeps the focus on its own card, which moves to the front (spec 0014, AC-16)", async () => {
    setEpisodeWatched.mockResolvedValue(marked());
    await markAndRefresh(2, [1, 2, 3], [2, 1, 3], 2);
    expect(toast.mock.calls[0][0]).toBe("Marked Show 2 S1E8 watched");
    await waitFor(() =>
      expect(document.activeElement?.id).toBe(showCardLinkId(2)),
    );
  });
});
