import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0020, AC-10, AC-17
 *
 * `HeldShowsSection` is an async Server Component, so each test awaits it and
 * renders what it returns. The held rows read and the TMDB batch read are the
 * boundaries; `LIBRARY_CLASSIFY_LIMIT` stays real so the "more" note follows
 * the same number the app uses. The card is a client component with its own
 * suite, so here it is a stub that shows the title it was handed.
 */
const getHeldShows = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/tracking/library-lists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tracking/library-lists")>()),
  getHeldShows: (...args: unknown[]) => getHeldShows(...args),
}));

class FakeTmdbError extends Error {}
const getTvShowsSettled = vi.fn();
vi.mock("@/lib/tmdb", () => ({
  TmdbError: FakeTmdbError,
  getTvShowsSettled: (...args: unknown[]) => getTvShowsSettled(...args),
}));

vi.mock("./held-show-card", () => ({
  HeldShowCard: (props: {
    showId: number;
    hold: string;
    title: { kind: string; name?: string };
    itemId: string;
  }) => (
    <span data-testid={`held-${props.showId}`} data-item-id={props.itemId}>
      {props.hold}:{props.title.kind}:{props.title.name ?? ""}
    </span>
  ),
}));

const { HeldShowsSection } = await import("./held-shows");
const { LIBRARY_CLASSIFY_LIMIT } = await import("@/lib/tracking/library-lists");

async function renderSection() {
  return render(<>{await HeldShowsSection({ userId: "user-a" })}</>);
}

function row(showId: number, hold: "paused" | "dropped" = "paused") {
  return { showId, hold, holdChangedAt: "2026-10-01T10:00:00.000Z" };
}

function show(id: number, name: string) {
  return { id, name, posterUrl: `https://image.tmdb.org/t/p/w342/${id}.jpg` };
}

beforeEach(() => {
  getTvShowsSettled.mockResolvedValue({ found: new Map(), missingIds: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("HeldShowsSection", () => {
  it("reads the held shows of the session's user", async () => {
    getHeldShows.mockResolvedValue({ kind: "ok", rows: [], total: 0 });
    await renderSection();
    expect(getHeldShows).toHaveBeenCalledWith("user-a");
  });

  it("renders nothing and reads no TMDB title when no show is held (AC-10)", async () => {
    getHeldShows.mockResolvedValue({ kind: "ok", rows: [], total: 0 });
    const { container } = await renderSection();
    expect(container).toBeEmptyDOMElement();
    expect(getTvShowsSettled).not.toHaveBeenCalled();
  });

  it("shows a failure with a retry back to the Watchlist shows tab when the read fails", async () => {
    getHeldShows.mockResolvedValue({ kind: "failed" });
    await renderSection();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load your watchlist");
    expect(
      within(alert).getByRole("link", { name: "Try again" }),
    ).toHaveAttribute("href", "/watchlist?type=tv");
  });

  it("is a collapsed disclosure titled with the exact number held (AC-10)", async () => {
    getHeldShows.mockResolvedValue({
      kind: "ok",
      rows: [row(1), row(2, "dropped")],
      total: 2,
    });
    const { container } = await renderSection();
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(details?.querySelector("summary")).toHaveTextContent(
      "Paused & dropped (2)",
    );
    expect(details?.querySelector("summary")).toHaveAttribute(
      "id",
      "held-shows-summary",
    );
  });

  it("lists every held show in the order read, with its hold and an item id for focus moves (AC-10)", async () => {
    getHeldShows.mockResolvedValue({
      kind: "ok",
      rows: [row(20, "dropped"), row(10)],
      total: 2,
    });
    getTvShowsSettled.mockResolvedValue({
      found: new Map([
        [10, show(10, "Lost")],
        [20, show(20, "Fringe")],
      ]),
      missingIds: [],
    });
    await renderSection();
    const grid = screen.getByRole("list", { name: "Paused and dropped shows" });
    const items = within(grid).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "dropped:found:Fringe",
      "paused:found:Lost",
    ]);
    expect(items[0]).toHaveAttribute("id", "held-show-item-20");
    expect(screen.getByTestId("held-20")).toHaveAttribute(
      "data-item-id",
      "held-show-item-20",
    );
    expect(getTvShowsSettled).toHaveBeenCalledWith([20, 10]);
  });

  it("keeps a show TMDB no longer has as missing and a failed one as unavailable (AC-10, AC-17)", async () => {
    getHeldShows.mockResolvedValue({
      kind: "ok",
      rows: [row(1), row(2), row(3)],
      total: 3,
    });
    getTvShowsSettled.mockResolvedValue({
      found: new Map([[1, show(1, "Lost")]]),
      missingIds: [2],
    });
    await renderSection();
    expect(screen.getByTestId("held-1")).toHaveTextContent("paused:found:Lost");
    expect(screen.getByTestId("held-2")).toHaveTextContent("paused:missing:");
    expect(screen.getByTestId("held-3")).toHaveTextContent(
      "paused:unavailable:",
    );
  });

  it("still lists every held show as unavailable when TMDB fails for all of them (AC-10)", async () => {
    getHeldShows.mockResolvedValue({
      kind: "ok",
      rows: [row(1), row(2, "dropped")],
      total: 2,
    });
    getTvShowsSettled.mockRejectedValue(new FakeTmdbError("down"));
    await renderSection();
    expect(screen.getByText("Paused & dropped (2)")).toBeInTheDocument();
    expect(screen.getByTestId("held-1")).toHaveTextContent(
      "paused:unavailable:",
    );
    expect(screen.getByTestId("held-2")).toHaveTextContent(
      "dropped:unavailable:",
    );
  });

  it("lets an error that is not a TMDB failure through", async () => {
    getHeldShows.mockResolvedValue({ kind: "ok", rows: [row(1)], total: 1 });
    getTvShowsSettled.mockRejectedValue(new TypeError("bug"));
    await expect(HeldShowsSection({ userId: "user-a" })).rejects.toThrow("bug");
  });

  it("notes the cap only when more shows are held than are listed (AC-10)", async () => {
    getHeldShows.mockResolvedValue({
      kind: "ok",
      rows: [row(1)],
      total: LIBRARY_CLASSIFY_LIMIT + 1,
    });
    await renderSection();
    expect(
      screen.getByText(`Paused & dropped (${LIBRARY_CLASSIFY_LIMIT + 1})`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `Showing your ${LIBRARY_CLASSIFY_LIMIT} most recently changed`,
      ),
    ).toBeInTheDocument();
  });

  it("has no cap note at exactly the limit", async () => {
    getHeldShows.mockResolvedValue({
      kind: "ok",
      rows: [row(1)],
      total: LIBRARY_CLASSIFY_LIMIT,
    });
    await renderSection();
    expect(screen.queryByText(/most recently changed/)).not.toBeInTheDocument();
  });
});
