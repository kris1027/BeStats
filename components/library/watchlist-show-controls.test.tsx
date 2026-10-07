import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0020, AC-9
 *
 * The controls are async Server Components, so each test awaits them and
 * renders what they return. The cached TMDB season read is the boundary. The
 * Mark watched button has its own suite, so here it is a stub that shows the
 * episode it was handed: the point is that only an id from a successful read
 * ever reaches it.
 */
class FakeTmdbError extends Error {}
const getSeason = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/tmdb", () => ({
  TmdbError: FakeTmdbError,
  getSeason: (...args: unknown[]) => getSeason(...args),
}));

vi.mock("./mark-next-watched-button", () => ({
  MarkNextWatchedButton: (props: {
    showId: number;
    showName: string;
    seasonNumber: number;
    episodeNumber: number;
    episodeId: number;
  }) => (
    <button type="button" data-testid="mark-next">
      {props.showId}:{props.showName}:S{props.seasonNumber}E
      {props.episodeNumber}:{props.episodeId}
    </button>
  ),
}));

const { NextEpisodeName, WatchlistShowControls, WatchlistShowControlsPending } =
  await import("./watchlist-show-controls");

const NEXT = { season: 2, episode: 3 };

function season(
  episodes: { id: number; episodeNumber: number; name: string | null }[],
) {
  return { episodes };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("WatchlistShowControls (AC-9)", () => {
  it("shows the next episode pill and Mark watched with the episode's TMDB id", async () => {
    getSeason.mockResolvedValue(
      season([
        { id: 501, episodeNumber: 2, name: "Two" },
        { id: 502, episodeNumber: 3, name: "Three" },
      ]),
    );
    render(
      await WatchlistShowControls({
        showId: 456,
        showName: "The Simpsons",
        next: NEXT,
      }),
    );
    expect(getSeason).toHaveBeenCalledWith(456, 2);
    expect(screen.getByText("S2E3")).toBeInTheDocument();
    expect(
      screen.getByText("Next episode, season 2 episode 3"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("mark-next")).toHaveTextContent(
      "456:The Simpsons:S2E3:502",
    );
  });

  it("shows Next episode unavailable with a retry, and no button, when the season read fails", async () => {
    getSeason.mockRejectedValue(new FakeTmdbError("down"));
    render(
      await WatchlistShowControls({
        showId: 456,
        showName: "The Simpsons",
        next: NEXT,
      }),
    );
    expect(screen.getByText("Next episode unavailable")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/watchlist?type=tv",
    );
    expect(screen.queryByTestId("mark-next")).not.toBeInTheDocument();
    expect(screen.queryByText("S2E3")).not.toBeInTheDocument();
  });

  it("offers nothing to mark when the season does not list the episode", async () => {
    getSeason.mockResolvedValue(
      season([{ id: 501, episodeNumber: 2, name: "Two" }]),
    );
    render(
      await WatchlistShowControls({
        showId: 456,
        showName: "The Simpsons",
        next: NEXT,
      }),
    );
    expect(screen.getByText("Next episode unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("mark-next")).not.toBeInTheDocument();
  });

  it("lets an error that is not a TMDB failure through", async () => {
    getSeason.mockRejectedValue(new TypeError("bug"));
    await expect(
      WatchlistShowControls({ showId: 457, showName: "X", next: NEXT }),
    ).rejects.toThrow("bug");
  });
});

describe("NextEpisodeName (AC-9)", () => {
  it("shows the next episode's name", async () => {
    getSeason.mockResolvedValue(
      season([{ id: 502, episodeNumber: 3, name: "Treehouse" }]),
    );
    render(<>{await NextEpisodeName({ showId: 458, next: NEXT })}</>);
    expect(screen.getByText("Treehouse")).toBeInTheDocument();
  });

  it("shows nothing when TMDB has no name for it", async () => {
    getSeason.mockResolvedValue(
      season([{ id: 502, episodeNumber: 3, name: null }]),
    );
    const { container } = render(
      <>{await NextEpisodeName({ showId: 459, next: NEXT })}</>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing when the read failed", async () => {
    getSeason.mockRejectedValue(new FakeTmdbError("down"));
    const { container } = render(
      <>{await NextEpisodeName({ showId: 460, next: NEXT })}</>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("WatchlistShowControlsPending (AC-9)", () => {
  it("shows the pill already known from classification, and no button yet", () => {
    render(<WatchlistShowControlsPending next={NEXT} />);
    expect(screen.getByText("S2E3")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
