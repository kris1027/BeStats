import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0020, AC-6; prompts/catalog-card-status.md, R5, R7
 *
 * The grid read is the boundary, so it is what is replaced.
 */
const getShowGridStatus = vi.fn();
vi.mock("@/lib/tracking/show-grid-status", () => ({
  getShowGridStatus: (...args: unknown[]) => getShowGridStatus(...args),
}));
vi.mock("@/lib/tracking/episode-state", () => ({
  requestTodayUtc: () => "2026-10-10",
}));
vi.mock("@/app/shows/actions", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const { ShowCardBadge, ShowCardControls, ShowCardMeta } = await import(
  "./show-card-slots"
);

afterEach(() => {
  vi.clearAllMocks();
});

const props = { showId: 1399, gridShowIds: [1400, 1399] };

function grid(status?: unknown) {
  getShowGridStatus.mockResolvedValue({
    kind: "ok",
    state: new Map(status === undefined ? [] : [[1399, status]]),
  });
}

async function renderCard(base: string | null = null) {
  return render(
    <>
      {await ShowCardBadge({ ...props, tmdbRating: 8.4 })}
      <p data-testid="meta">{await ShowCardMeta({ ...props, base })}</p>
      {
        await ShowCardControls({
          ...props,
          name: "Game of Thrones",
          returnPath: "/shows",
        })
      }
    </>,
  );
}

function trackedBookmark() {
  return screen.getByRole("button", { name: "Stop tracking Game of Thrones" });
}

describe("show card slots", () => {
  it("asks for the whole grid under one shared key (AC-6)", async () => {
    grid();
    await renderCard();
    expect(getShowGridStatus).toHaveBeenCalledWith("1399,1400");
  });

  it("shows an untracked show as the catalog does", async () => {
    grid();
    await renderCard("2011");
    expect(screen.getByText("TMDB rating")).toBeInTheDocument();
    expect(screen.getByTestId("meta")).toHaveTextContent(/^2011$/);
    expect(
      screen.getByRole("button", { name: "Track Game of Thrones" }),
    ).toBeInTheDocument();
  });

  it("keeps a tracked show on Watchlist as it is today", async () => {
    grid({ page: "watchlist", next: { season: 2, episode: 3 }, rating: null });
    await renderCard();
    expect(screen.getByText("TMDB rating")).toBeInTheDocument();
    expect(screen.getByTestId("meta")).toBeEmptyDOMElement();
    expect(trackedBookmark()).toBeInTheDocument();
  });

  it("shows a show on Upcoming with its next episode date and no rating", async () => {
    grid({
      page: "upcoming",
      airDate: "2026-10-20",
      next: { season: 2, episode: 1 },
      rating: null,
    });
    await renderCard();
    expect(screen.getByText("S2E1 · Oct 20")).toBeInTheDocument();
    expect(screen.queryByText("TMDB rating")).not.toBeInTheDocument();
    expect(trackedBookmark()).toBeInTheDocument();
  });

  it("shows a rated finished show with its show rating and label", async () => {
    grid({ page: "watched", label: "finished", rating: 7.25 });
    await renderCard("2011");
    expect(screen.getByText("Your show rating")).toBeInTheDocument();
    expect(screen.queryByText("TMDB rating")).not.toBeInTheDocument();
    expect(screen.getByTestId("meta")).toHaveTextContent("2011 · Finished");
    expect(trackedBookmark()).toBeInTheDocument();
  });

  it("keeps the TMDB rating on an unrated caught up show", async () => {
    grid({ page: "watched", label: "caught_up", rating: null });
    await renderCard();
    expect(screen.getByText("TMDB rating")).toBeInTheDocument();
    expect(screen.getByTestId("meta")).toHaveTextContent(/^Caught up$/);
  });

  it("leaves a tracked show whose page is unknown a plain tracked card", async () => {
    grid(null);
    await renderCard("2011");
    expect(screen.getByText("TMDB rating")).toBeInTheDocument();
    expect(screen.getByTestId("meta")).toHaveTextContent(/^2011$/);
    expect(trackedBookmark()).toBeInTheDocument();
  });

  it.each([
    ["a visitor", { kind: "signed_out" }],
    ["a failed read", { kind: "failed" }],
  ])("gives %s the catalog card", async (_, read) => {
    getShowGridStatus.mockResolvedValue(read);
    await renderCard("2011");
    expect(screen.getByText("TMDB rating")).toBeInTheDocument();
    expect(screen.getByTestId("meta")).toHaveTextContent(/^2011$/);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
